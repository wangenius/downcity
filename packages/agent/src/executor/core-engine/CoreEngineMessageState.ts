/**
 * CoreEngine 模型消息运行态。
 *
 * 关键点（中文）
 * - CoreEngine 同时维护 session 语义消息与模型消息。
 * - 新增 user 消息可优先做增量转换，失败时再回退为全量重算。
 * - assistant UI 消息只需要进入 session 语义基线；模型侧使用 SDK 返回的 response messages。
 */

import type { ModelMessage, Tool } from "ai";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import {
  pickMergedUserMessages,
  toModelMessages,
} from "@executor/messages/SessionMessageCodec.js";

/**
 * CoreEngine 单轮执行期间的消息基线。
 */
export class CoreEngineMessageState {
  /**
   * 当前运行时 session 语义消息。
   */
  private sessionMessages: SessionMessageV1[];

  /**
   * 当前模型侧消息基线。
   */
  private currentModelMessages: ModelMessage[];

  /**
   * 当前轮可用工具集合。
   */
  private readonly tools: Record<string, Tool>;

  /**
   * 当前项目根目录，用于解析历史中的相对路径 file part。
   */
  private readonly projectRoot?: string;

  private constructor(params: {
    /**
     * 当前运行时 session 语义消息。
     */
    sessionMessages: SessionMessageV1[];
    /**
     * 当前模型侧消息基线。
     */
    modelMessages: ModelMessage[];
    /**
     * 当前轮可用工具集合。
     */
    tools: Record<string, Tool>;
    /**
     * 当前项目根目录。
     */
    projectRoot?: string;
  }) {
    this.sessionMessages = params.sessionMessages;
    this.currentModelMessages = params.modelMessages;
    this.tools = params.tools;
    this.projectRoot = params.projectRoot;
  }

  /**
   * 基于初始 session 消息创建运行态。
   */
  static async create(params: {
    /**
     * 初始 session 语义消息。
     */
    messages: SessionMessageV1[];
    /**
     * 当前轮可用工具集合。
     */
    tools: Record<string, Tool>;
    /**
     * 当前项目根目录。
     */
    projectRoot?: string;
  }): Promise<CoreEngineMessageState> {
    const sessionMessages = Array.isArray(params.messages)
      ? [...params.messages]
      : [];
    return new CoreEngineMessageState({
      sessionMessages,
      modelMessages: await toModelMessages(
        sessionMessages,
        params.tools,
        params.projectRoot,
      ),
      tools: params.tools,
      projectRoot: params.projectRoot,
    });
  }

  /**
   * 读取当前模型消息。
   */
  get modelMessages(): ModelMessage[] {
    return this.currentModelMessages;
  }

  /**
   * 把 step 间新增的 user 消息并入两份基线。
   */
  async appendMergedUserMessages(
    messages: SessionMessageV1[],
  ): Promise<ModelMessage[]> {
    const mergedMessages = pickMergedUserMessages(messages);
    if (mergedMessages.length === 0) return [];
    return await this.appendSessionMessagesAsModelMessages(mergedMessages);
  }

  /**
   * 追加内部生成的 user nudge 消息。
   */
  async appendUserTextMessage(message: SessionMessageV1): Promise<void> {
    await this.appendSessionMessagesAsModelMessages([message]);
  }

  /**
   * 追加 assistant UI 消息到 session 语义基线。
   */
  appendRuntimeSessionMessage(message: SessionMessageV1): void {
    this.sessionMessages = [...this.sessionMessages, message];
  }

  /**
   * 追加 SDK 返回的模型 response messages。
   */
  appendModelMessages(messages: ModelMessage[]): void {
    if (!Array.isArray(messages) || messages.length === 0) return;
    this.currentModelMessages = [...this.currentModelMessages, ...messages];
  }

  private async appendSessionMessagesAsModelMessages(
    messages: SessionMessageV1[],
  ): Promise<ModelMessage[]> {
    this.sessionMessages = [...this.sessionMessages, ...messages];
    const modelMessages = await toModelMessages(
      messages,
      this.tools,
      this.projectRoot,
    );
    if (modelMessages.length > 0) {
      this.currentModelMessages = [...this.currentModelMessages, ...modelMessages];
      return modelMessages;
    }
    this.currentModelMessages = await toModelMessages(
      this.sessionMessages,
      this.tools,
      this.projectRoot,
    );
    return [];
  }
}
