/**
 * ExecutionContext 类型定义。
 *
 * 关键点（中文）
 * - 这里定义 service / plugin / prompt system 共用的统一执行上下文。
 * - `ExecutionContext` 表达的是“当前一次执行可见的能力面”，不是宿主状态本体。
 * - `AgentState` 才负责保存长期状态；`ExecutionContext` 只负责把这些状态暴露成执行接口。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import type { AgentState } from "@/types/AgentState.js";
import type { DowncityConfig } from "@/types/DowncityConfig.js";
import type { JsonValue } from "@/types/Json.js";
import type { PluginPort } from "@/types/Plugin.js";
import type {
  SessionMetadataV1,
  SessionMessageV1,
  SessionUserMessageV1,
} from "@/types/SessionMessage.js";
import type {
  SessionAssistantStepCallback,
  SessionRunInput,
  SessionRunResult,
} from "@/types/SessionRun.js";

/**
 * 跨 service 调用参数。
 */
export interface InvokeServiceParams {
  /**
   * 目标 service 名称。
   */
  service: string;
  /**
   * 目标 action 名称。
   */
  action: string;
  /**
   * 调用时附带的结构化 payload。
   */
  payload?: JsonValue;
}

/**
 * 跨 service 调用结果。
 */
export interface InvokeServiceResult {
  /**
   * 调用是否成功。
   */
  success: boolean;
  /**
   * 成功时返回的数据载荷。
   */
  data?: JsonValue;
  /**
   * 失败时的错误信息。
   */
  error?: string;
}

/**
 * 跨 service 调用端口。
 */
export interface InvokeServicePort {
  /**
   * 调用指定 service action。
   */
  invoke(params: InvokeServiceParams): Promise<InvokeServiceResult>;
}

/**
 * Session 持久化端口。
 */
export interface SessionPersistorPort {
  /**
   * 读取全部消息。
   */
  list(): Promise<SessionMessageV1[]>;
  /**
   * 读取指定范围消息。
   */
  slice(start: number, end: number): Promise<SessionMessageV1[]>;
  /**
   * 追加一条消息。
   */
  append(message: SessionMessageV1): Promise<void>;
  /**
   * 获取当前消息数量。
   */
  size(): Promise<number>;
  /**
   * 读取附加元信息。
   */
  meta(): Promise<Record<string, unknown>>;
  /**
   * 构造一条 user 文本消息。
   */
  userText(params: {
    /**
     * 用户文本内容。
     */
    text: string;
    /**
     * 消息元信息。
     */
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    /**
     * 显式指定消息 id。
     */
    id?: string;
  }): SessionMessageV1;
  /**
   * 构造一条 assistant 文本消息。
   */
  assistantText(params: {
    /**
     * 助手文本内容。
     */
    text: string;
    /**
     * 消息元信息。
     */
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    /**
     * 显式指定消息 id。
     */
    id?: string;
    /**
     * 消息逻辑类型。
     */
    kind?: "normal" | "summary";
    /**
     * 消息来源。
     */
    source?: "egress" | "compact";
  }): SessionMessageV1;
}

/**
 * 单个 Session 执行端口。
 */
export interface SessionRuntimePort {
  /**
   * 执行一次 session run。
   */
  run(params: SessionRunInput): Promise<SessionRunResult>;

  /**
   * 请求取消当前正在执行的 turn。
   *
   * 关键点（中文）
   * - 对普通本地 runtime 可不实现。
   * - ACP runtime 可借此向远端发送 `session/cancel`。
   */
  requestCancelCurrentTurn?(): Promise<boolean> | boolean;
}

/**
 * Session 能力入口。
 */
export interface SessionPort {
  /**
   * 获取指定 session 的执行端口。
   */
  getRuntime(sessionId: string): SessionRuntimePort;
  /**
   * 获取指定 session 的持久化端口。
   */
  getPersistor(sessionId: string): SessionPersistorPort;
  /**
   * 直接执行一次 session。
   */
  run(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 本轮输入文本。
     */
    query: string;
    /**
     * step 边界回调。
     */
    onStepCallback?: () => Promise<SessionUserMessageV1[]>;
    /**
     * assistant step 回调。
     */
    onAssistantStepCallback?: SessionAssistantStepCallback;
  }): Promise<SessionRunResult>;
  /**
   * 清理指定 session 的 runtime 缓存。
   */
  clearRuntime(sessionId?: string): void;
  /**
   * session 更新后的异步通知钩子。
   */
  afterSessionUpdatedAsync(sessionId: string): Promise<void>;
  /**
   * 追加一条 user 消息。
   */
  appendUserMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    text?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  /**
   * 追加一条 assistant 消息。
   */
  appendAssistantMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    fallbackText?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  /**
   * 当前统一模型实例。
   */
  model?: LanguageModel;
}

/**
 * 统一执行上下文。
 */
export interface ExecutionContext {
  /**
   * 当前执行上下文对应的 agent 状态。
   */
  agent: AgentState;
  /**
   * 当前命令工作目录。
   */
  cwd: string;
  /**
   * 当前项目根目录。
   */
  rootPath: string;
  /**
   * 统一日志器。
   */
  logger: Logger;
  /**
   * 当前运行时已解析配置。
   */
  config: DowncityConfig;
  /**
   * 当前项目环境变量快照。
   */
  env: Record<string, string>;
  /**
   * 当前生效的 system 文本集合。
   */
  systems: string[];
  /**
   * Session 能力入口。
   *
   * 关键点（中文）
   * - service 与 plugin 都通过这里访问 session 执行与持久化能力。
   * - 内外统一使用 `sessionId` 语义。
   */
  session: SessionPort;
  /**
   * 跨 service 调用主入口。
   */
  invoke: InvokeServicePort;
  /**
   * Plugin 调用入口。
   */
  plugins: PluginPort;
}

/**
 * 允许 optional 字段的结构化配置对象。
 */
export type StructuredConfig = {
  [key: string]: JsonValue | undefined;
};
