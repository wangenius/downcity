/**
 * Agent SDK 本地入口。
 *
 * 关键点（中文）
 * - `new Agent({ id, path, tools })` 只做同步配置装配，不在构造阶段启动任何 I/O。
 * - session、HTTP、RPC 都按需异步初始化。
 * - v1 不直接暴露 service/plugin 管理能力。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { Tool } from "ai";
import { Logger } from "@shared/utils/logger/Logger.js";
import type {
  AgentOptions,
  AgentSessionMetadata,
} from "@/types/sdk/AgentSdk.js";
import { SdkSession } from "@/sdk/Session.js";
import { loadStaticSystemPrompts } from "@session/composer/system/default/StaticPromptCatalog.js";
import { getSdkAgentSessionsRootDirPath } from "@/sdk/Paths.js";
import { SdkAgentHttpServer } from "@/sdk/HttpServer.js";
import { SdkAgentRpcServer } from "@/sdk/RpcServer.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly http: SdkAgentHttpServer;
  readonly rpc: SdkAgentRpcServer;

  private readonly logger: Logger;
  private readonly sessionsById = new Map<string, SdkSession>();
  private systems: string[];

  constructor(options: AgentOptions) {
    this.id = String(options.id || "").trim();
    this.path = String(options.path || "").trim();
    this.tools = options.tools && typeof options.tools === "object"
      ? { ...options.tools }
      : {};
    if (!this.id) {
      throw new Error("Agent requires a non-empty id");
    }
    if (!this.path) {
      throw new Error("Agent requires a non-empty path");
    }

    this.logger = new Logger();
    this.logger.bindProjectRoot(this.path);
    this.systems = loadStaticSystemPrompts(this.path);
    this.http = new SdkAgentHttpServer(this);
    this.rpc = new SdkAgentRpcServer(this);
  }

  /**
   * 获取或创建一个 session。
   */
  async session(sessionId?: string): Promise<SdkSession> {
    const resolvedSessionId =
      String(sessionId || "").trim() || `session-${Date.now()}-${nanoid(8)}`;
    const cached = this.sessionsById.get(resolvedSessionId);
    if (cached) return cached;

    const created = new SdkSession({
      agentId: this.id,
      projectRoot: this.path,
      sessionId: resolvedSessionId,
      tools: this.tools,
      logger: this.logger,
      getStaticSystemPrompts: () => this.systems,
    });
    await created.initialize();
    this.sessionsById.set(resolvedSessionId, created);
    return created;
  }

  /**
   * 列出当前 agent 的全部 session 元数据。
   */
  async sessions(): Promise<AgentSessionMetadata[]> {
    const rootDir = getSdkAgentSessionsRootDirPath(this.path, this.id);
    if (!(await fs.pathExists(rootDir))) return [];
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const items: AgentSessionMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let sessionId = "";
      try {
        sessionId = decodeURIComponent(entry.name);
      } catch {
        sessionId = entry.name;
      }
      if (!sessionId) continue;
      const session = await this.session(sessionId);
      items.push(await session.toMetadata());
    }
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return items;
  }

  /**
   * 刷新静态 system 文本集合。
   */
  reloadStaticPrompts(): void {
    this.systems = loadStaticSystemPrompts(this.path);
  }
}
