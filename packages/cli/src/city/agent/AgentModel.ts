/**
 * Agent 模型配置服务。
 *
 * 关键点（中文）
 * - 模型候选项唯一来源是当前 Federation user client 的 `ai.listModels()`。
 * - 全局 `downcity.db` 只保存选中的 `execution.modelId`，不缓存远端模型目录。
 * - CLI 子命令与 Agent 交互管理器共用本模块，避免出现两套配置行为。
 */

import path from "node:path";
import prompts from "@/city/tui/Prompts.js";
import { listPlatformModelChoices } from "@/city/runtime/city-model/ExecutionModelBinding.js";
import {
  readAgentConfig,
  upsertAgentConfig,
} from "@/city/process/registry/AgentConfigStore.js";
import { listRegisteredAgentsForCli } from "@/city/agent/AgentSelection.js";
import { restartCommand } from "@/city/agent/Restart.js";
import { emitCliBlock } from "@/shared/CliReporter.js";
import { CliError } from "@/shared/CliError.js";
import type {
  AgentModelCommandOptions,
  AgentModelConfigurationResult,
  AgentModelRestartResponse,
  AgentModelSelectionResponse,
} from "@/city/types/AgentModel.js";

/** 读取 Agent 当前绑定的 Federation model id。 */
export function read_agent_model_id(project_root: string): string {
  const config = readAgentConfig(project_root);
  return String(
    config?.execution?.type === "api" ? config.execution.modelId || "" : "",
  ).trim();
}

/**
 * 将已通过 Federation 校验的 model id 写入全局 Agent 配置。
 */
export function persist_agent_model_id(
  project_root_input: string,
  model_id_input: string,
): AgentModelConfigurationResult {
  const project_root = path.resolve(project_root_input);
  const model_id = String(model_id_input || "").trim();
  const current_config = readAgentConfig(project_root);
  if (!current_config) {
    throw new CliError({
      title: "Agent config not found",
      note: `project: ${project_root}`,
      fix: "downcity agent create <path>",
    });
  }
  if (!model_id) {
    throw new CliError({
      title: "Model id is required",
      fix: `downcity agent model ${project_root}`,
    });
  }

  const previous_model_id = read_agent_model_id(project_root);
  if (previous_model_id !== model_id) {
    upsertAgentConfig({
      ...current_config,
      projectRoot: project_root,
      execution: { type: "api", modelId: model_id },
    });
  }

  return {
    project_root,
    agent_id: current_config.id,
    previous_model_id,
    current_model_id: model_id,
    changed: previous_model_id !== model_id,
    restarted: false,
  };
}

/** 从 Federation 目录选择或校验目标模型。 */
async function resolve_agent_model_id(
  project_root: string,
  requested_model_id_input?: string,
): Promise<string | null> {
  const choices = await listPlatformModelChoices();
  if (choices.length === 0) {
    throw new CliError({
      title: "No models available in Federation",
      note: "请确认当前 Federation 已发布 AI models，且登录用户有权调用。",
      fix: "downcity federation status",
    });
  }

  const requested_model_id = String(requested_model_id_input || "").trim();
  if (requested_model_id) {
    if (!choices.some((choice) => choice.value === requested_model_id)) {
      throw new CliError({
        title: `Model not available: ${requested_model_id}`,
        note: "目标模型不在当前 Federation user client 返回的 AI models 中。",
        fix: `downcity agent model ${project_root}`,
      });
    }
    return requested_model_id;
  }

  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new CliError({
      title: "Model id is required in non-interactive mode",
      fix: `downcity agent model ${project_root} --set <model-id>`,
    });
  }

  const current_model_id = read_agent_model_id(project_root);
  const initial = Math.max(
    0,
    choices.findIndex((choice) => choice.value === current_model_id),
  );
  const response = (await prompts({
    type: "select",
    name: "model_id",
    message: "选择 Agent 使用的模型",
    choices,
    initial,
  })) as AgentModelSelectionResponse;

  const selected_model_id = String(response.model_id || "").trim();
  return selected_model_id || null;
}

/** 判断目标 Agent daemon 当前是否运行。 */
async function is_agent_running(project_root: string): Promise<boolean> {
  const agents = await listRegisteredAgentsForCli();
  return agents.some(
    (agent) =>
      path.resolve(agent.projectRoot) === project_root && agent.status === "running",
  );
}

/** 解析模型更新后的重启决策。 */
async function should_restart_agent(
  requested_restart: boolean | undefined,
): Promise<boolean> {
  if (requested_restart !== undefined) return requested_restart;
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return false;
  const response = (await prompts({
    type: "confirm",
    name: "restart",
    message: "模型已更新，立即重启 Agent 生效？",
    initial: true,
  })) as AgentModelRestartResponse;
  return response.restart === true;
}

/**
 * 配置 Agent 当前模型，并按需重启运行中的 daemon。
 */
export async function configure_agent_model(
  project_root_input: string,
  options: AgentModelCommandOptions = {},
): Promise<AgentModelConfigurationResult | null> {
  const project_root = path.resolve(project_root_input);
  const selected_model_id = await resolve_agent_model_id(project_root, options.set);
  if (!selected_model_id) {
    emitCliBlock({
      tone: "info",
      title: "Agent model unchanged",
      summary: project_root,
    });
    return null;
  }

  const result = persist_agent_model_id(project_root, selected_model_id);
  if (!result.changed) {
    emitCliBlock({
      tone: "info",
      title: "Agent model unchanged",
      summary: result.agent_id,
      facts: [
        { label: "modelId", value: result.current_model_id },
        { label: "project", value: result.project_root },
      ],
    });
    return result;
  }

  emitCliBlock({
    tone: "success",
    title: "Agent model updated",
    summary: result.agent_id,
    facts: [
      { label: "previous", value: result.previous_model_id || "(none)" },
      { label: "current", value: result.current_model_id },
      { label: "storage", value: "downcity.db / agent_configs" },
      { label: "project", value: result.project_root },
    ],
  });

  if (!(await is_agent_running(project_root))) return result;
  const restart = await should_restart_agent(options.restart);
  if (!restart) {
    emitCliBlock({
      tone: "info",
      title: "Agent restart required",
      note: `run \`downcity agent restart ${project_root}\` to apply the new model`,
    });
    return result;
  }

  await restartCommand(project_root, {});
  return {
    ...result,
    restarted: true,
  };
}
