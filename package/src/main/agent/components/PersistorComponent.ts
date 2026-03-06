/**
 * PersistorComponent：会话历史持久化组件抽象。
 *
 * 关键点（中文）
 * - 负责“历史读写 + 运行输入准备 + 文本消息工厂”。
 * - 不负责模型调用，不负责执行编排。
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
import { AgentComponent } from "./AgentComponent.js";

/**
 * prepare 输入参数。
 */
export type PersistorPrepareInput = {
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
  system: SystemModelMessage[];

  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前重试次数（由 Agent 递增）。
   */
  retryCount: number;
};

/**
 * compact 输入参数。
 */
export type PersistorCompactInput = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前轮 system messages。
   */
  system: SystemModelMessage[];

  /**
   * 保留最近消息条数。
   */
  keepLastMessages: number;

  /**
   * 输入 token 近似上限。
   */
  maxInputTokensApprox: number;

  /**
   * compact 时是否归档旧消息。
   */
  archiveOnCompact: boolean;
};

/**
 * Persistor 组件抽象类。
 */
export abstract class PersistorComponent extends AgentComponent {
  /**
   * 组件名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 当前会话 ID。
   */
  abstract readonly contextId: string;

  /**
   * 为本轮 Agent 执行准备模型输入消息。
   */
  abstract prepare(input: PersistorPrepareInput): Promise<ModelMessage[]>;

  /**
   * 执行一次 compact（best-effort）。
   */
  abstract compact(input: PersistorCompactInput): Promise<{
    compacted: boolean;
    reason?: string;
  }>;

  /**
   * 追加一条消息到历史。
   */
  abstract append(message: ContextMessageV1): Promise<void>;

  /**
   * 读取完整消息历史。
   */
  abstract list(): Promise<ContextMessageV1[]>;

  /**
   * 读取消息区间 [start, end)。
   */
  abstract slice(start: number, end: number): Promise<ContextMessageV1[]>;

  /**
   * 读取消息总条数。
   */
  abstract size(): Promise<number>;

  /**
   * 读取元信息。
   */
  abstract meta(): Promise<Record<string, unknown>>;

  /**
   * 构造 user 文本消息。
   */
  abstract userText(input: {
    /**
     * 用户文本内容。
     */
    text: string;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;
  }): ContextMessageV1;

  /**
   * 构造 assistant 文本消息。
   */
  abstract assistantText(input: {
    /**
     * 助手文本内容。
     */
    text: string;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;

    /**
     * 消息种类（普通/摘要）。
     */
    kind?: "normal" | "summary";

    /**
     * 消息来源（egress/compact）。
     */
    source?: "egress" | "compact";
  }): ContextMessageV1;

  /**
   * 可选初始化钩子。
   */
  // 生命周期沿用 AgentComponent 默认实现。
}
