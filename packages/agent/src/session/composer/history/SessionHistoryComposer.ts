/**
 * SessionHistoryComposer：会话历史 Composer 抽象。
 *
 * 关键点（中文）
 * - 负责把历史事实源组装成本轮模型输入消息。
 * - 不负责 append / list / meta / archive 等落盘能力。
 * - 不负责模型调用，不负责执行编排。
 */

import type { LanguageModel, Tool } from "ai";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { SessionSystemMessage } from "@/session/types/SessionPrompts.js";

/**
 * prepare 输入参数。
 */
export type SessionHistoryPrepareInput = {
  /**
   * 当前用户查询文本。
   */
  query: string;

  /**
   * 当前轮可用工具集合。
   */
  tools: Record<string, Tool>;

  /**
   * 当前轮 system messages。
   */
  system: SessionSystemMessage[];

  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前重试次数（由 Executor 递增）。
   */
  retryCount: number;
};

/**
 * SessionHistoryComposer 协议。
 */
export interface SessionHistoryComposer {
  /**
   * Composer 名（由具体实现声明）。
   */
  readonly name: string;

  /**
   * 当前会话 ID。
   */
  readonly sessionId: string;

  /**
   * 为本轮 Session 执行准备模型输入消息。
   */
  prepare(input: SessionHistoryPrepareInput): Promise<SessionMessageV1[]>;
}
