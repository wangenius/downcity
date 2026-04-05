/**
 * AgentContext 类型定义。
 *
 * 关键点（中文）
 * - 这里定义 service / plugin / prompt system 共用的统一执行上下文。
 * - `AgentContext` 表达的是“当前一次执行可见的能力面”，不是宿主状态本体。
 * - `AgentRuntime` 才负责保存长期状态；`AgentContext` 只负责把这些状态暴露成执行接口。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import type {
  AgentAuthRuntime,
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/shared/types/AgentHost.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { PluginPort } from "@/shared/types/Plugin.js";
import type { ChatMetaV1 } from "@services/chat/types/ChatMeta.js";
import type {
  ChatQueueEnqueueParams,
  ChatQueueEnqueueResult,
} from "@services/chat/types/ChatQueue.js";
import type {
  SessionMetadataV1,
  SessionMessageV1,
  SessionUserMessageV1,
} from "@/types/session/SessionMessages.js";
import type {
  SessionAssistantStepCallback,
  SessionRunInput,
  SessionRunResult,
} from "@/types/session/SessionRun.js";

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
export interface SessionHistoryComposerPort {
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
export interface SessionExecutorPort {
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
 * 单个 Session 实例端口。
 */
export interface SessionPort {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;
  /**
   * 获取当前 session 的执行端口。
   */
  getExecutor(): SessionExecutorPort;
  /**
   * 获取当前 session 的持久化端口。
   */
  getHistoryComposer(): SessionHistoryComposerPort;
  /**
   * 执行当前 session 的一次请求。
   */
  run(params: {
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
   * 清理当前 session 的 executor 缓存。
   */
  clearExecutor(): void;
  /**
   * 当前 session 更新后的异步通知钩子。
   */
  afterSessionUpdatedAsync(): Promise<void>;
  /**
   * 追加一条 user 消息。
   */
  appendUserMessage(params: {
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    text?: string;
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
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    fallbackText?: string;
    /**
     * 附加元数据。
     */
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean;
}

/**
 * Session 集合入口。
 */
export interface SessionCollectionPort {
  /**
   * 获取指定 sessionId 对应的 Session 实例。
   */
  get(sessionId: string): SessionPort;
  /**
   * 返回当前所有执行中的 sessionId。
   */
  listExecutingSessionIds(): string[];
  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number;
  /**
   * 当前统一模型实例。
   */
  model?: LanguageModel;
}

/**
 * Chat 运行时能力入口。
 *
 * 关键点（中文）
 * - 这是当前 agent 已装配好的 chat 运行时视图。
 * - 其他 service 只能通过这里消费 chat 能力，不能直接 import chat runtime 模块。
 */
export interface ChatRuntimePort {
  /**
   * 按 sessionId 读取 chat 路由元信息。
   */
  readMetaBySessionId(sessionId: string): Promise<ChatMetaV1 | null>;
  /**
   * 向指定 session 追加一条 exec 入站消息。
   */
  appendExecSessionMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 要写入的文本。
     */
    text: string;
    /**
     * 附加结构化元数据。
     */
    extra?: JsonObject;
  }): Promise<void>;
  /**
   * 向 chat queue 入队一条消息。
   */
  enqueue(params: ChatQueueEnqueueParams): ChatQueueEnqueueResult;
}

/**
 * 统一执行上下文。
 */
export interface AgentContext {
  /**
   * 当前执行上下文对应的 agent 状态。
   */
  agent: AgentRuntime;
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
   * 当前 console 级全局环境变量快照。
   */
  globalEnv: Record<string, string>;
  /**
   * 当前生效的 system 文本集合。
   */
  systems: string[];
  /**
   * 当前可见的路径能力集合。
   */
  paths: AgentPathRuntime;
  /**
   * 当前可见的认证能力集合。
   */
  auth: AgentAuthRuntime;
  /**
   * 当前可见的 plugin 配置持久化能力集合。
   */
  pluginConfig: AgentPluginConfigRuntime;
  /**
   * Session 能力入口。
   *
   * 关键点（中文）
   * - service 与 plugin 都通过这里访问 session 执行与持久化能力。
   * - 内外统一使用 `sessionId` 语义。
   */
  session: SessionCollectionPort;
  /**
   * 跨 service 调用主入口。
   */
  invoke: InvokeServicePort;
  /**
   * Chat 运行时能力入口。
   */
  chat: ChatRuntimePort;
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
