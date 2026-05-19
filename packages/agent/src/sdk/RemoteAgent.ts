/**
 * RemoteAgent：远程 SDK 客户端。
 *
 * 关键点（中文）
 * - 面向已启动 `agent.http.start()` 的远程/本地 HTTP 服务。
 * - 与本地 `Agent` 尽量保持同一套 session 使用面。
 */

import type {
  AgentSessionMetadata,
  AgentSessionRunInput,
  AgentSessionRunResult,
  AgentSessionSetInput,
  AgentSessionStreamEvent,
  RemoteAgentOptions,
} from "@/sdk/AgentSdkTypes.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";

/**
 * 远程 Session 客户端。
 */
class RemoteSession {
  readonly id: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl;
    this.id = sessionId;
  }

  /**
   * 远程 session 当前不支持直接注入本地模型实例。
   */
  async set(_input: AgentSessionSetInput): Promise<void> {
    throw new Error(
      "Remote session.set({ model }) is not supported in v1. Configure the model on the server-side local Agent session instead.",
    );
  }

  /**
   * 执行一轮非流式请求。
   */
  async run(input: AgentSessionRunInput): Promise<AgentSessionRunResult> {
    const response = await fetch(`${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      result?: AgentSessionRunResult;
    };
    if (!response.ok || !payload.success || !payload.result) {
      throw new Error(String(payload.error || "Remote session run failed"));
    }
    return payload.result;
  }

  /**
   * 读取远程消息历史。
   */
  async history(): Promise<SessionMessageV1[]> {
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/messages`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      messages?: SessionMessageV1[];
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.messages)) {
      throw new Error(String(payload.error || "Remote session history failed"));
    }
    return payload.messages;
  }

  /**
   * 读取远程 session 当前生效的 system prompt 文本集合。
   */
  async system(): Promise<string[]> {
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/system`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      system?: string[];
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.system)) {
      throw new Error(String(payload.error || "Remote session system failed"));
    }
    return payload.system;
  }

  /**
   * 分叉远程 session。
   */
  async fork(messageId?: string): Promise<RemoteSession> {
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/fork`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(messageId ? { messageId } : {}),
        }),
      },
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionMetadata;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session fork failed"));
    }
    return new RemoteSession(this.baseUrl, payload.session.sessionId);
  }

  /**
   * 执行一轮流式请求。
   */
  async *stream(
    input: AgentSessionRunInput,
  ): AsyncIterable<AgentSessionStreamEvent> {
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Remote session stream failed (${response.status})`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffered = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (line) {
          yield JSON.parse(line) as AgentSessionStreamEvent;
        }
        newlineIndex = buffered.indexOf("\n");
      }
    }
    const tail = buffered.trim();
    if (tail) {
      yield JSON.parse(tail) as AgentSessionStreamEvent;
    }
  }
}

/**
 * RemoteAgent：远程 Agent 客户端。
 */
export class RemoteAgent {
  private readonly baseUrl: string;

  constructor(options: RemoteAgentOptions) {
    const baseUrl = String(options.baseUrl || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("RemoteAgent requires a non-empty baseUrl");
    }
    this.baseUrl = baseUrl;
  }

  /**
   * 获取或创建一个远程 session。
   */
  async session(sessionId?: string): Promise<RemoteSession> {
    const response = await fetch(`${this.baseUrl}/api/sdk/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(sessionId ? { sessionId } : {}),
      }),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionMetadata;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session load failed"));
    }
    return new RemoteSession(this.baseUrl, payload.session.sessionId);
  }

  /**
   * 列出远程 agent 的全部 session 元数据。
   */
  async sessions(): Promise<AgentSessionMetadata[]> {
    const response = await fetch(`${this.baseUrl}/api/sdk/sessions`);
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      sessions?: AgentSessionMetadata[];
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.sessions)) {
      throw new Error(String(payload.error || "Remote sessions list failed"));
    }
    return payload.sessions;
  }
}
