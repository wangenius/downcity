/**
 * SessionRunContext：单次 session run 的显式运行上下文。
 *
 * 关键点（中文）
 * - 这里承载本轮执行过程中需要在多个组件间透传的运行期数据。
 * - 业务侧上下文优先通过该对象显式传递，避免分散读取隐式全局状态。
 * - tool 深层回调等无法直接传参的场景，才通过 run scope 间接读取这个对象。
 */

import type {
  AgentSessionActionCallback,
  AgentSessionActionEvent,
  AgentSessionActionRecord,
} from "@/types/sdk/AgentSessionAction.js";
import type {
  SessionAssistantStepCallback,
  SessionUiMessageChunkCallback,
} from "@/executor/types/SessionRun.js";
import type { SessionUserMessageV1 } from "@/executor/types/SessionRecords.js";
import type { FileUIPart } from "ai";

/**
 * 单次 session run 的运行上下文。
 */
export interface SessionRunContext {
  /**
   * 当前执行所属的 turn 标识。
   *
   * 关键点（中文）
   * - session 是长期对话容器，turn 是单次用户输入触发的执行轮次。
   * - 工具运行时发布 session event 时应优先使用该字段，避免把 sessionId 误当 turnId。
   */
  turnId?: string;

  /**
   * 当前执行所属的 session 标识。
   */
  sessionId: string;

  /**
   * 当前执行所属的项目根目录。
   *
   * 关键点（中文）
   * - 用于 tool/plugin 运行期把二进制资源写入项目级 `.downcity/resources`。
   * - 未提供时，底层资源写入逻辑会回退到当前进程工作目录，兼容旧入口。
   */
  projectRoot?: string;

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
   * action 发布回调。
   *
   * 关键点（中文）
   * - 用于把 compaction 等辅助动作转成 session event 与 action record。
   * - action 不代表 assistant 正文，也不会进入 LLM 输入。
   */
  onActionCallback?: AgentSessionActionCallback;

  /**
   * 当前 turn 的取消信号。
   *
   * 关键点（中文）
   * - `session.stop()` 会触发该 signal。
   * - 模型流、tool-loop 与长耗时 composer 应优先监听它，尽快结束当前 turn。
   */
  abortSignal?: AbortSignal;

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

export type {
  AgentSessionActionCallback,
  AgentSessionActionEvent,
  AgentSessionActionRecord,
};
