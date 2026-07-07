/**
 * Agent Session operation 类型定义。
 *
 * 关键点（中文）
 * - operation 描述 session 内部正在发生的辅助操作，不代表 assistant 正文。
 * - operation 可以同时作为订阅事件发布，也可以作为 UIMessage 持久化到 JSONL。
 * - operation message 只用于前端时间线与调试，不应进入 LLM 输入。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * Session operation 当前状态。
 */
export type AgentSessionOperationStatus =
  | "started"
  | "progress"
  | "finished"
  | "skipped"
  | "failed";

/**
 * Session operation 名称。
 *
 * 说明（中文）
 * - 内置名称用于 SDK 与前端约定常见辅助操作。
 * - 字符串扩展允许 plugin 或宿主运行时声明自己的 operation。
 */
export type AgentSessionOperationName =
  | "compacting"
  | "model-switching"
  | "history-forking"
  | (string & {});

/**
 * Session operation 记录。
 */
export interface AgentSessionOperationRecord {
  /**
   * 同一个 operation 生命周期内稳定复用的 ID。
   */
  operationId: string;

  /**
   * 当前 operation 名称。
   */
  name: AgentSessionOperationName;

  /**
   * 当前 operation 状态。
   */
  status: AgentSessionOperationStatus;

  /**
   * 当前 operation 关联的 turn 标识。
   *
   * 说明（中文）
   * - turn 内触发的 operation 应写入该字段。
   * - session 级 operation 可以省略。
   */
  turnId?: string;

  /**
   * 面向用户展示的短文本。
   */
  label?: string;

  /**
   * 机器可读原因。
   *
   * 示例（中文）
   * - `under_budget`：未达到压缩阈值。
   * - `summary_fallback`：摘要生成失败后使用降级摘要。
   */
  reason?: string;

  /**
   * 当前 operation 进度，范围 0 到 1。
   *
   * 说明（中文）
   * - 无法估算进度时省略。
   */
  progress?: number;

  /**
   * operation 完成后产生的轻量结果。
   */
  result?: JsonValue;

  /**
   * operation 失败时的错误文本。
   */
  error?: string;

  /**
   * 是否建议前端展示。
   *
   * 说明（中文）
   * - 默认视为 `true`。
   * - 调试或审计类辅助事件可显式写入 `false`。
   */
  visible?: boolean;
}

/**
 * Session operation 订阅事件。
 */
export interface AgentSessionOperationEvent extends AgentSessionOperationRecord {
  /**
   * 当前事件类型。
   */
  type: "operation";

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;
}

/**
 * Session operation 发布回调。
 */
export type AgentSessionOperationCallback = (
  operation: AgentSessionOperationEvent,
) => Promise<void>;
