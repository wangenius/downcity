/**
 * SessionRunContext：单次 session run 的显式运行上下文。
 *
 * 关键点（中文）
 * - 这里承载本轮执行过程中需要在多个组件间透传的运行期数据。
 * - 业务侧上下文优先通过该对象显式传递，避免分散读取隐式全局状态。
 * - tool 深层回调等无法直接传参的场景，才通过 run scope 间接读取这个对象。
 */

import type {
  SessionAssistantStepCallback,
  SessionUiMessageChunkCallback,
} from "@/executor/types/SessionRun.js";
import type { SessionUserMessageV1 } from "@/executor/types/SessionMessages.js";
import type { FileUIPart } from "ai";

/**
 * 单次 session run 的运行上下文。
 */
export interface SessionRunContext {
  /**
   * 当前执行所属的 session 标识。
   */
  sessionId: string;

  /**
   * step 边界合并回调。
   *
   * 关键点（中文）
   * - 由 Session actor 在 turn 运行期间注入。
   * - 用于把运行中追加的 user 消息并入下一 step。
   */
  onStepCallback?: () => Promise<SessionUserMessageV1[]>;

  /**
   * assistant step 完成回调。
   *
   * 关键点（中文）
   * - 用于把中间 step 文本或 reasoning 事件回传给 Session 事件流。
   */
  onAssistantStepCallback?: SessionAssistantStepCallback;

  /**
   * UI stream chunk 回调。
   *
   * 关键点（中文）
   * - 用于把底层模型 UI chunk 旁路输出到订阅流或 transport。
   */
  onUiMessageChunkCallback?: SessionUiMessageChunkCallback;

  /**
   * 本轮运行中待并入下一 step 的 user 消息。
   *
   * 关键点（中文）
   * - 主要由 tool runtime 在当前 turn 内动态注入。
   * - 这些消息只影响当前执行，不会自动持久化。
   */
  injectedUserMessages: SessionUserMessageV1[];

  /**
   * 本轮运行结束后待写入长期历史的 user 消息。
   *
   * 关键点（中文）
   * - 为保证时间线顺序稳定，这些消息会在 assistant 结果落盘之后统一持久化。
   */
  deferredPersistedUserMessages: SessionUserMessageV1[];

  /**
   * 本轮运行结束前待并入最终 assistant 消息的 file parts。
   *
   * 关键点（中文）
   * - 用于 tool/plugin 在执行期产生图片、文件等最终输出。
   * - 这些 part 不依赖模型把 tool result 再复述一遍，直接落入 assistant UIMessage。
   */
  pendingAssistantFileParts: FileUIPart[];
}
