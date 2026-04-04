/**
 * ProjectExecutionBinding：项目执行绑定解析与校验。
 *
 * 关键点（中文）
 * - 项目只允许一条执行路径：`execution.type = "model" | "acp"`。
 * - 所有 create / start / runtime / UI 读写都通过这里统一解析。
 * - 避免执行模式判断散落在多个模块中。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type {
  AcpExecutionBindingConfig,
  ExecutionBindingConfig,
  ExecutionBindingMode,
  ModelExecutionBindingConfig,
} from "@/shared/types/ExecutionBinding.js";
import type { SessionAgentType } from "@/shared/types/SessionAgent.js";

/**
 * 读取项目执行绑定。
 */
export function readProjectExecutionBinding(
  config: DowncityConfig,
): ExecutionBindingConfig | null {
  const execution = config.execution;
  if (!execution || typeof execution !== "object") return null;
  if (execution.type === "model") {
    const modelId = String((execution as ModelExecutionBindingConfig).modelId || "").trim();
    if (!modelId) return null;
    return {
      type: "model",
      modelId,
    };
  }
  if (execution.type === "acp") {
    const agent = (execution as AcpExecutionBindingConfig).agent;
    const agentType = String(agent?.type || "").trim();
    if (agentType !== "codex" && agentType !== "claude" && agentType !== "kimi") {
      return null;
    }
    return {
      type: "acp",
      agent: {
        type: agentType as SessionAgentType,
        command: String(agent?.command || "").trim() || undefined,
        args: Array.isArray(agent?.args)
          ? agent.args.map((item) => String(item || "").trim()).filter(Boolean)
          : undefined,
        env:
          agent?.env && typeof agent.env === "object"
            ? Object.fromEntries(
                Object.entries(agent.env).map(([key, value]) => [
                  String(key || "").trim(),
                  String(value ?? ""),
                ]),
              )
            : undefined,
      },
    };
  }
  return null;
}

/**
 * 读取项目执行模式。
 */
export function readProjectExecutionMode(
  config: DowncityConfig,
): ExecutionBindingMode | null {
  return readProjectExecutionBinding(config)?.type || null;
}

/**
 * 读取项目绑定的主模型 ID。
 */
export function readProjectPrimaryModelId(config: DowncityConfig): string {
  const execution = readProjectExecutionBinding(config);
  return execution?.type === "model" ? execution.modelId : "";
}

/**
 * 读取项目绑定的 ACP agent 类型。
 */
export function readProjectSessionAgentType(
  config: DowncityConfig,
): "codex" | "claude" | "kimi" | null {
  const execution = readProjectExecutionBinding(config);
  return execution?.type === "acp" ? execution.agent.type : null;
}

/**
 * 判断项目是否存在执行目标。
 */
export function hasProjectExecutionTarget(config: DowncityConfig): boolean {
  return readProjectExecutionBinding(config) !== null;
}

/**
 * 断言项目已经声明执行目标。
 */
export function assertProjectExecutionTarget(config: DowncityConfig): void {
  if (hasProjectExecutionTarget(config)) return;
  throw new Error(
    'Invalid downcity.json: "execution" is required and must be either { "type": "model", "modelId": "..." } or { "type": "acp", "agent": { "type": "codex|claude|kimi" } }',
  );
}
