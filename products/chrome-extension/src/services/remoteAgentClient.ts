/**
 * 浏览器端 RemoteAgent 客户端适配层。
 *
 * 关键点（中文）：
 * - Chrome Extension 只需要 RemoteAgent 的 HTTP session 能力，不直接打包 `@downcity/agent`。
 * - 对外暴露接近 RemoteAgent Session 的方法名，Side Panel 不再感知 `/api/sdk/*` 细节。
 * - 底层复用现有轻量 HTTP 实现，避免引入 Node runtime 依赖。
 */

import type {
  AgentSdkHistoryItem,
  AgentSdkSessionEvent,
  AgentSdkSessionInfo,
} from "../types/api";
import {
  ensureAgentSdkSession,
  fetchAgentSdkHistory,
  getAgentSdkSessionInfo,
  promptAgentSdkSession,
  subscribeAgentSdkSessionEvents,
} from "./agentSession";

/**
 * RemoteAgent 浏览器客户端参数。
 */
export interface RemoteAgentClientOptions {
  /**
   * Agent runtime HTTP 地址。
   */
  baseUrl: string;
  /**
   * 当前 Town Token。
   */
  token?: string;
}

/**
 * RemoteAgent session 订阅参数。
 */
export interface RemoteAgentSessionSubscribeOptions {
  /**
   * 收到 session 事件时触发。
   */
  onEvent: (event: AgentSdkSessionEvent) => void;
  /**
   * 事件连接失败时触发。
   */
  onError?: (error: Error) => void;
}

/**
 * 浏览器端 RemoteAgent session。
 */
export interface RemoteAgentBrowserSession {
  /**
   * 当前 session id。
   */
  id: string;
  /**
   * 读取历史消息。
   */
  history: (input?: { limit?: number }) => Promise<AgentSdkHistoryItem[]>;
  /**
   * 发送 prompt。
   */
  prompt: (input: { query: string }) => Promise<string>;
  /**
   * 订阅后续事件。
   */
  subscribe: (
    options: RemoteAgentSessionSubscribeOptions,
  ) => Promise<() => void>;
}

/**
 * 判断是否是 session 不存在。
 */
function isSessionNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /not found|404/i.test(message);
}

/**
 * 创建浏览器端 RemoteAgent 客户端。
 */
export function createRemoteAgentClient(options: RemoteAgentClientOptions) {
  const baseUrl = String(options.baseUrl || "").trim();
  const token = String(options.token || "").trim();

  return {
    /**
     * 创建或获取稳定 session。
     */
    async getSession(sessionId: string): Promise<RemoteAgentBrowserSession> {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId) throw new Error("缺少 RemoteAgent Session");

      let info: AgentSdkSessionInfo;
      try {
        info = await getAgentSdkSessionInfo({
          serverBaseUrl: baseUrl,
          sessionId: normalizedSessionId,
          authToken: token,
        });
      } catch (error) {
        if (!isSessionNotFoundError(error)) throw error;
        info = await ensureAgentSdkSession({
          serverBaseUrl: baseUrl,
          sessionId: normalizedSessionId,
          authToken: token,
        });
      }
      const id = String(info.sessionId || normalizedSessionId);

      return {
        id,
        history: async (input) =>
          fetchAgentSdkHistory({
            serverBaseUrl: baseUrl,
            sessionId: id,
            authToken: token,
            limit: input?.limit,
          }),
        prompt: async (input) =>
          promptAgentSdkSession({
            serverBaseUrl: baseUrl,
            sessionId: id,
            authToken: token,
            query: input.query,
          }),
        subscribe: async (subscribeOptions) =>
          subscribeAgentSdkSessionEvents({
            serverBaseUrl: baseUrl,
            sessionId: id,
            authToken: token,
            onEvent: subscribeOptions.onEvent,
            onError: subscribeOptions.onError,
          }),
      };
    },
  };
}
