/**
 * Agent 默认模型与运行中 Session 模型配置服务。
 *
 * 关键点（中文）
 * - 模型候选项唯一来源是当前 Federation user client 的 `ai.listModels()`。
 * - Agent 默认模型写入全局 DB 的 `execution.modelId`，下次启动或重启生效。
 * - Session 模型覆盖写入 City 全局数据库，由运行中 Agent 在下一轮注入模型实例。
 */

import path from "node:path";
import prompts from "@/city/tui/Prompts.js";
import { listPlatformModelChoices } from "@/city/runtime/city-model/ExecutionModelBinding.js";
import { listRegisteredAgentsForCli } from "@/city/agent/AgentSelection.js";
import {
  createRemoteAgent,
  getOrCreateRemoteSession,
  listRemoteChatSessions,
} from "@/city/agent/AgentChatRemote.js";
import {
  readAgentConfig,
  upsertAgentConfig,
} from "@/city/process/registry/AgentConfigStore.js";
import { emitCliBlock } from "@/shared/CliReporter.js";
import { CliError } from "@/shared/CliError.js";
import type { RemoteAgent } from "@downcity/agent";
import {
  read_session_model_override,
  write_session_model_override,
} from "@/city/agent/CitySessionModelRuntime.js";
import type {
  AgentModelAgentTarget,
  AgentModelCommandOptions,
  AgentModelConfigurationResult,
  AgentModelResolutionInput,
  AgentModelResolvedTarget,
  AgentModelSelectionResponse,
  AgentModelTargetSelectionResponse,
} from "@/city/types/AgentModel.js";

const AGENT_DEFAULT_TARGET = "agent-default";
const SESSION_TARGET_PREFIX = "session:";

/** 解析已登记的目标 Agent，不要求 daemon 正在运行。 */
async function resolve_agent_target(
  project_root: string,
): Promise<AgentModelAgentTarget> {
  const agents = await listRegisteredAgentsForCli();
  const matched = agents.find(
    (agent) => path.resolve(agent.projectRoot) === project_root,
  );
  if (!matched) {
    throw new CliError({
      title: "Agent is not registered",
      note: `project: ${project_root}`,
      fix: `downcity agent create ${project_root}`,
    });
  }
  return {
    agent_id: matched.id,
    status: matched.status,
  };
}

/** 解析交互式或显式模型配置目标。 */
async function resolve_model_target(params: {
  /** 目标 Agent。 */
  agent: AgentModelAgentTarget;
  /** 已连接的 RemoteAgent；Agent 停止时不存在。 */
  remote_agent?: RemoteAgent;
  /** 命令选项。 */
  options: AgentModelCommandOptions;
  /** 目标项目根目录。 */
  project_root: string;
}): Promise<AgentModelResolvedTarget | null> {
  const requested_session_id = String(params.options.sessionId || "").trim();
  if (requested_session_id) {
    assert_session_target_available(params.agent, params.project_root);
    return { kind: "session", session_id: requested_session_id };
  }

  // 关键点（中文）：显式 --set 且未指定 Session 时，稳定表示修改 Agent 默认模型。
  if (String(params.options.set || "").trim()) {
    return { kind: "agent-default" };
  }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    return { kind: "agent-default" };
  }

  const choices = [{
    title: "Agent default",
    description: "Persist execution.modelId · effective after start/restart",
    value: AGENT_DEFAULT_TARGET,
  }];
  if (params.agent.status === "running" && params.remote_agent) {
    const sessions = await listRemoteChatSessions({ remote_agent: params.remote_agent });
    choices.push(...sessions.map((session) => ({
      title: session.title || session.sessionId,
      description: [
        session.sessionId,
        read_session_model_override(params.project_root, session.sessionId) ||
          "agent default",
      ]
        .filter(Boolean)
        .join(" · "),
      value: `${SESSION_TARGET_PREFIX}${session.sessionId}`,
    })));
  }

  const response = (await prompts({
    type: "select",
    name: "target",
    message: "选择模型配置目标",
    choices,
    initial: 0,
  })) as AgentModelTargetSelectionResponse;
  const selected = String(response.target || "").trim();
  if (!selected) return null;
  if (selected === AGENT_DEFAULT_TARGET) return { kind: "agent-default" };
  if (selected.startsWith(SESSION_TARGET_PREFIX)) {
    return {
      kind: "session",
      session_id: selected.slice(SESSION_TARGET_PREFIX.length),
    };
  }
  throw new Error(`Unknown model target: ${selected}`);
}

/** 断言 Session 模型目标可以通过运行中 Agent 更新。 */
function assert_session_target_available(
  agent: AgentModelAgentTarget,
  project_root: string,
): void {
  if (agent.status === "running") return;
  throw new CliError({
    title: "Agent is not running",
    note: "Session 模型只能通过运行中的 Agent 更新；Agent 默认模型不受此限制。",
    fix: `downcity agent start ${project_root}`,
  });
}

/** 从 Federation 目录选择或校验目标模型。 */
async function resolve_model_id(
  params: AgentModelResolutionInput,
): Promise<string | null> {
  const choices = await listPlatformModelChoices();
  if (choices.length === 0) {
    throw new CliError({
      title: "No models available in Federation",
      note: "请确认当前 Federation 已发布可用于对话的 AI models，且登录用户有权调用。",
      fix: "downcity federation status",
    });
  }

  const requested_model_id = String(params.requested_model_id || "").trim();
  if (requested_model_id) {
    if (!choices.some((choice) => choice.value === requested_model_id)) {
      throw new CliError({
        title: `Model not available: ${requested_model_id}`,
        note: "目标模型不在当前 Federation user client 返回的对话模型中。",
        fix: build_model_command_hint(params),
      });
    }
    return requested_model_id;
  }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new CliError({
      title: "Model id is required in non-interactive mode",
      fix: build_model_command_hint(params, " --set <model-id>"),
    });
  }

  const initial = Math.max(
    0,
    choices.findIndex((choice) => choice.value === params.current_model_id),
  );
  const response = (await prompts({
    type: "select",
    name: "model_id",
    message: params.target.kind === "session"
      ? "选择当前 Session 使用的模型"
      : "选择 Agent 默认模型",
    choices,
    initial,
  })) as AgentModelSelectionResponse;
  return String(response.model_id || "").trim() || null;
}

/** 构建错误信息中的可执行命令提示。 */
function build_model_command_hint(
  params: AgentModelResolutionInput,
  suffix = "",
): string {
  const session = params.target.kind === "session"
    ? ` --session-id ${params.target.session_id}`
    : "";
  return `downcity agent model ${params.project_root}${session}${suffix}`;
}

/** 读取 Agent 当前默认模型 ID。 */
function read_agent_default_model_id(project_root: string): string {
  const config = readAgentConfig(project_root);
  return String(
    config?.execution?.type === "api" ? config.execution.modelId || "" : "",
  ).trim();
}

/** 写入 Agent 默认模型 ID。 */
function update_agent_default_model(
  project_root: string,
  model_id: string,
): void {
  upsertAgentConfig({
    projectRoot: project_root,
    execution: {
      type: "api",
      modelId: model_id,
    },
  });
}

/** 配置 Agent 默认模型或运行中 Session 的覆盖模型。 */
export async function configure_agent_model(
  project_root_input: string,
  options: AgentModelCommandOptions = {},
): Promise<AgentModelConfigurationResult | null> {
  const project_root = path.resolve(project_root_input);
  const agent = await resolve_agent_target(project_root);
  const needs_remote_agent = agent.status === "running"
    && (!String(options.set || "").trim() || Boolean(String(options.sessionId || "").trim()));
  const remote_agent = needs_remote_agent
    ? await createRemoteAgent({ projectRoot: project_root })
    : undefined;

  try {
    const target = await resolve_model_target({
      agent,
      remote_agent,
      options,
      project_root,
    });
    if (!target) return null;

    if (target.kind === "agent-default") {
      const previous_model_id = read_agent_default_model_id(project_root);
      const selected_model_id = await resolve_model_id({
        current_model_id: previous_model_id,
        requested_model_id: options.set,
        project_root,
        target,
      });
      if (!selected_model_id) return null;
      const changed = selected_model_id !== previous_model_id;
      if (changed) update_agent_default_model(project_root, selected_model_id);
      return emit_model_result({
        project_root,
        agent_id: agent.agent_id,
        target: "agent-default",
        previous_model_id,
        current_model_id: selected_model_id,
        changed,
        effective: "next-start",
      });
    }

    assert_session_target_available(agent, project_root);
    const session_id = String(target.session_id || "").trim();
    if (!session_id || !remote_agent) throw new Error("Session model target is unavailable");
    await getOrCreateRemoteSession({ remote_agent, session_id });
    const previous_model_id = String(
      read_session_model_override(project_root, session_id) ||
        read_agent_default_model_id(project_root),
    ).trim();
    const selected_model_id = await resolve_model_id({
      current_model_id: previous_model_id,
      requested_model_id: options.set,
      project_root,
      target,
    });
    if (!selected_model_id) return null;
    const changed = selected_model_id !== previous_model_id;
    if (changed) {
      write_session_model_override(
        project_root,
        session_id,
        selected_model_id,
      );
    }
    return emit_model_result({
      project_root,
      agent_id: agent.agent_id,
      target: "session",
      session_id,
      previous_model_id,
      current_model_id: selected_model_id,
      changed,
      effective: "next-turn",
    });
  } finally {
    await remote_agent?.close();
  }
}

/** 输出统一的模型配置结果。 */
function emit_model_result(
  result: AgentModelConfigurationResult,
): AgentModelConfigurationResult {
  const target_label = result.target === "session"
    ? `Session ${result.session_id}`
    : "Agent default";
  emitCliBlock({
    tone: result.changed ? "success" : "info",
    title: result.changed ? `${target_label} model updated` : `${target_label} model unchanged`,
    summary: result.agent_id,
    facts: [
      { label: "target", value: target_label },
      { label: "previous", value: result.previous_model_id || "(not configured)" },
      { label: "current", value: result.current_model_id },
      {
        label: "effective",
        value: result.effective === "next-turn" ? "next turn" : "next start/restart",
      },
    ],
  });
  return result;
}
