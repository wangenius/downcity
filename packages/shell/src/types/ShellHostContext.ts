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

export type ShellHostIntegration = {
  /**
   * 获取当前 agent/session run 上下文。
   */
  getRunContext?(): ShellRunContext | null | undefined;
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
