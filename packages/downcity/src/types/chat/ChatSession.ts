/**
 * ChatSession 相关类型定义。
 *
 * 关键点（中文）
 * - Chat 专用 session 会把“队列消息合并 / step 回发”收敛到 chat 层自身。
 * - 普通 Session 仍可复用基础 `run / append*` 能力，不强耦合 chat 语义。
 */

import type { SessionUserMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionAssistantStepCallback } from "@/types/session/SessionRun.js";

/**
 * ChatSession 单次 turn 绑定的运行态。
 */
export interface ChatSessionTurnState {
  /**
   * 提取本轮 step 边界新增的 user 消息。
   *
   * 关键点（中文）
   * - 该回调用于把同一 chat lane 后续到达的消息并入当前推理。
   * - 若未提供，则表示当前 turn 不启用 step 合并。
   */
  onStepCallback?: () => Promise<SessionUserMessageV1[]>;

  /**
   * assistant step 回发钩子。
   *
   * 关键点（中文）
   * - ChatSession 内部会先完成 step 持久化，再调用该钩子做真实渠道发送。
   */
  onAssistantStepCallback?: SessionAssistantStepCallback;
}
