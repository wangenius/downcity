/**
 * 运行中 Session 模型配置服务。
 *
 * 关键点（中文）
 * - 模型候选项唯一来源是当前 Federation user client 的 `ai.listModels()`。
 * - 模型切换通过 RemoteAgent 写入目标 Session，下一轮立即生效，无需重启 Agent。
 * - Session model id 随项目运行数据持久化；全局 DB 中的 Agent model id 仅是默认值。
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
import { emitCliBlock } from "@/shared/CliReporter.js";
import { CliError } from "@/shared/CliError.js";
import type {
  AgentModelCommandOptions,
  AgentModelConfigurationResult,
  AgentModelSelectionResponse,
  AgentModelSessionSelectionResponse,
  AgentModelRunningTarget,
  AgentModelSessionResolutionInput,
  AgentModelResolutionInput,
} from "@/city/types/AgentModel.js";

/** 解析运行中的目标 Agent。 */
async function resolve_running_agent(
  project_root: string,
): Promise<AgentModelRunningTarget> {
  const agents = await listRegisteredAgentsForCli();
  const matched = agents.find(
    (agent) => path.resolve(agent.projectRoot) === project_root,
  );
  if (!matched) {
    throw new CliError({
      title: "Agent is not registered",
      note: `project: ${project_root}`,
      fix: `downcity agent start ${project_root}`,
    });
  }
  if (matched.status !== "running") {
    throw new CliError({
      title: "Agent is not running",
      note: "Session 模型通过运行中的 Agent 切换，不需要也不会触发重启。",
      fix: `downcity agent start ${project_root}`,
    });
  }
  return { agent_id: matched.id };
}

/** 选择目标 Session。 */
async function resolve_session_id(
  params: AgentModelSessionResolutionInput,
): Promise<string | null> {
  const requested_session_id = String(params.requested_session_id || "").trim();
  if (requested_session_id) return requested_session_id;
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new CliError({
      title: "Session id is required in non-interactive mode",
      fix: `downcity agent model ${params.project_root} --session-id <session-id> --set <model-id>`,
    });
  }

  const sessions = await listRemoteChatSessions({
    remote_agent: params.remote_agent,
  });
  const response = (await prompts({
    type: "select",
    name: "session_id",
    message: "选择要切换模型的 Session",
    choices: sessions.map((session) => ({
      title: session.title || session.sessionId,
      description: [session.sessionId, session.modelId || "agent default"]
        .filter(Boolean)
        .join(" · "),
      value: session.sessionId,
    })),
    initial: 0,
  })) as AgentModelSessionSelectionResponse;
  return String(response.session_id || "").trim() || null;
}

/** 从 Federation 目录选择或校验目标模型。 */
async function resolve_session_model_id(
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
        fix: `downcity agent model ${params.project_root} --session-id ${params.session_id}`,
      });
    }
    return requested_model_id;
  }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new CliError({
      title: "Model id is required in non-interactive mode",
      fix: `downcity agent model ${params.project_root} --session-id ${params.session_id} --set <model-id>`,
    });
  }

  const initial = Math.max(
    0,
    choices.findIndex((choice) => choice.value === params.current_model_id),
  );
  const response = (await prompts({
    type: "select",
    name: "model_id",
    message: "选择当前 Session 使用的模型",
    choices,
    initial,
  })) as AgentModelSelectionResponse;
  return String(response.model_id || "").trim() || null;
}

/** 配置运行中 Session 的当前模型。 */
export async function configure_agent_model(
  project_root_input: string,
  options: AgentModelCommandOptions = {},
): Promise<AgentModelConfigurationResult | null> {
  const project_root = path.resolve(project_root_input);
  const agent = await resolve_running_agent(project_root);
  const remote_agent = await createRemoteAgent({ projectRoot: project_root });
  try {
    const session_id = await resolve_session_id({
      remote_agent,
      requested_session_id: options.sessionId,
      project_root,
    });
    if (!session_id) return null;
    const session = await getOrCreateRemoteSession({
      remote_agent,
      session_id,
    });
    const current_info = await session.get_info();
    const previous_model_id = String(current_info.modelId || "").trim();
    const selected_model_id = await resolve_session_model_id({
      current_model_id: previous_model_id,
      requested_model_id: options.set,
      project_root,
      session_id,
    });
    if (!selected_model_id) return null;

    const changed = selected_model_id !== previous_model_id;
    if (changed) {
      await session.set({ modelId: selected_model_id });
    }
    const result: AgentModelConfigurationResult = {
      project_root,
      agent_id: agent.agent_id,
      session_id,
      previous_model_id,
      current_model_id: selected_model_id,
      changed,
    };
    emitCliBlock({
      tone: changed ? "success" : "info",
      title: changed ? "Session model switched" : "Session model unchanged",
      summary: agent.agent_id,
      facts: [
        { label: "session", value: session_id },
        { label: "previous", value: previous_model_id || "(agent default)" },
        { label: "current", value: selected_model_id },
        { label: "effective", value: "next turn" },
      ],
    });
    return result;
  } finally {
    await remote_agent.close();
  }
}
