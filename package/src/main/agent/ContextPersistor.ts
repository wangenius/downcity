/**
 * ContextPersistor：上下文持久化/消息准备抽象。
 *
 * 关键点（中文）
 * - agent 只依赖抽象，不直接依赖具体存储实现。
 * - main 可通过继承实现具体策略（如文件落盘、compact、消息补齐）。
 */

import type {
  LanguageModel,
  ModelMessage,
  SystemModelMessage,
  Tool,
} from "ai";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";

export type PrepareRunMessagesInput = {
  contextId: string;
  query: string;
  tools: Record<string, Tool>;
  system: SystemModelMessage[];
  model: LanguageModel;
  retryAttempts: number;
};

export abstract class ContextPersistor {
  abstract readonly contextId: string;

  /**
   * 为一次 Agent 运行准备输入消息。
   *
   * 关键点（中文）
   * - 可在实现中执行消息压缩、历史读取与 query 补齐。
   * - 返回值必须是可直接传给模型的 ModelMessage 序列。
   */
  abstract prepareRunMessages(
    input: PrepareRunMessagesInput,
  ): Promise<ModelMessage[]>;

  abstract append(message: ContextMessageV1): Promise<void>;
  abstract loadAll(): Promise<ContextMessageV1[]>;
  abstract loadRange(
    startIndex: number,
    endIndex: number,
  ): Promise<ContextMessageV1[]>;
  abstract getTotalMessageCount(): Promise<number>;
  abstract loadMeta(): Promise<Record<string, unknown>>;
  abstract createUserTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
  }): ContextMessageV1;
  abstract createAssistantTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): ContextMessageV1;
}
