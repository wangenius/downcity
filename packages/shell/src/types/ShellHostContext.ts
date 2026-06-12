/**
 * Shell 宿主上下文类型。
 *
 * 关键点（中文）
 * - 这里只描述 shell / sandbox 需要的最小宿主能力。
 * - 不引用 agent 的 ShellHostContext，避免 shell 包反向绑定 agent session/runtime。
 */

import type { SandboxProjectConfig } from "@/sandbox/types/Sandbox.js";

export type ShellLogger = {
  /**
   * 输出 warning 日志。
   */
  warn(message: string, meta?: Record<string, unknown>): void;
};

export type ShellSessionEventPublisher = {
  /**
   * 发布宿主 session event。
   */
  publishEvent(event: Record<string, unknown>): void;
};

export type ShellHostSessionAccessor = {
  /**
   * 通过 session id 取得可发布事件的 session 视图。
   */
  get(session_id: string): ShellSessionEventPublisher;
};

export type ShellRunContext = {
  /**
   * 当前 session id。
   */
  sessionId?: string;
  /**
   * 当前 turn id。
   */
  turnId?: string;
};

export type ShellChatMeta = {
  /**
   * 聊天渠道名称。
   */
  channel: string;
  /**
   * 目标聊天 id。
   */
  chatId: string;
  /**
   * 目标类型。
   */
  targetType?: string;
  /**
   * 平台线程 id。
   */
  threadId?: number;
  /**
   * 平台消息 id。
   */
  messageId?: string;
  /**
   * 触发人 id。
   */
  actorId?: string;
  /**
   * 触发人名称。
   */
  actorName?: string;
};

export type ShellChatQueueInput = {
  /**
   * 队列动作类别。
   */
  kind: "exec";
  /**
   * 聊天渠道名称。
   */
  channel: string;
  /**
   * 目标聊天 id。
   */
  targetId: string;
  /**
   * session id。
   */
  sessionId: string;
  /**
   * 要投递的文本。
   */
  text: string;
  /**
   * 目标类型。
   */
  targetType?: string;
  /**
   * 平台线程 id。
   */
  threadId?: number;
  /**
   * 平台消息 id。
   */
  messageId?: string;
  /**
   * 触发人 id。
   */
  actorId?: string;
  /**
   * 触发人名称。
   */
  actorName?: string;
  /**
   * 额外元数据。
   */
  extra?: Record<string, unknown>;
};

export type ShellHostIntegration = {
  /**
   * 获取当前 agent/session run 上下文。
   */
  getRunContext?(): ShellRunContext | null | undefined;
  /**
   * 查询 chat session 元数据，用于 shell 自动回投。
   */
  readChatMeta?(input: { context: ShellHostContext; sessionId: string }): Promise<ShellChatMeta | null>;
  /**
   * 将内部 shell 完成通知放入 chat 队列。
   */
  enqueueChat?(context: ShellHostContext, input: ShellChatQueueInput): void;
};

export type ShellHostContext = {
  /**
   * 当前项目根目录。
   */
  rootPath: string;
  /**
   * 传给 shell 的显式环境变量。
   */
  env?: Record<string, string | undefined>;
  /**
   * Agent 配置的最小视图。
   */
  config?: {
    /**
     * Agent id。
     */
    id?: string;
    /**
     * Sandbox 配置。
     */
    sandbox?: SandboxProjectConfig;
  };
  /**
   * 可选日志器。
   */
  logger?: ShellLogger;
  /**
   * session event 发布器。
   */
  session?: ShellHostSessionAccessor;
  /**
   * 宿主注入的 shell 集成能力。
   */
  shellIntegration?: ShellHostIntegration;
};
