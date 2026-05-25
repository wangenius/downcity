/**
 * Agent Session prompt 输入类型定义。
 *
 * 关键点（中文）
 * - `prompt()` 是 Session actor 模型下唯一的输入入口。
 * - 首条输入、运行中补充输入、排队到下一轮的输入，调用侧都使用同一结构。
 */

import type { JsonObject } from "@/types/common/Json.js";

/**
 * Session prompt 输入。
 */
export interface AgentSessionPromptInput {
  /**
   * 当前这次要追加到 Session 的用户文本。
   *
   * 说明（中文）
   * - 调用侧永远只传“新的用户输入”。
   * - 它是否并入当前 turn，还是排到下一 turn，由 Session 内部决定。
   */
  query: string;

  /**
   * 当前这条 user 消息需要写入 session history 的附加元信息。
   *
   * 说明（中文）
   * - 仅影响本次 prompt 对应的 user message 落盘元数据。
   * - 不参与 turn 调度，也不会改变 prompt 并入/排队策略。
   */
  extra?: JsonObject;
}
