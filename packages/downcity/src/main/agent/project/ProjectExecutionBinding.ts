/**
 * ProjectExecutionBinding：项目执行绑定解析与校验。
 *
 * 关键点（中文）
 * - 项目只有一条执行路径：`execution.type = "api"`。
 * - 所有 create / start / runtime 读写都通过这里统一解析。
 * - 避免解析逻辑散落在多个模块中。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { ExecutionBindingConfig } from "@/shared/types/ExecutionBinding.js";

/**
 * 读取项目执行绑定。
 */
export function readProjectExecutionBinding(
  config: DowncityConfig,
): ExecutionBindingConfig | null {
  const execution = config.execution;
  if (!execution || typeof execution !== "object") return null;
  if (execution.type !== "api") return null;
  const modelId = String(execution.modelId || "").trim();
  if (!modelId) return null;
  return {
    type: "api",
    modelId,
  };
}

/**
 * 读取项目绑定的主模型 ID。
 */
export function readProjectPrimaryModelId(config: DowncityConfig): string {
  const execution = readProjectExecutionBinding(config);
  return execution ? execution.modelId : "";
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
    'Invalid downcity.json: "execution" is required and must be { "type": "api", "modelId": "..." }',
  );
}
