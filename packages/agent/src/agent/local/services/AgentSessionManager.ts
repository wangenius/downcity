/**
 * AgentSessionManager：本地 Agent session 管理服务。
 *
 * 关键点（中文）
 * - 统一管理 session 缓存、创建、恢复、默认配置注入与 session collection。
 * - 该服务只负责 session 生命周期与查询，不负责 plugin / RPC 启停。
 * - Session 对象创建细节集中在这里，避免 facade 和 lifecycle 重复依赖 Session 构造逻辑。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { Tool } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentModel,
  AgentSession,
  AgentSessionCollection,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
} from "@/types/agent/AgentTypes.js";
import { Session } from "@/session/Session.js";
import {
  getSdkAgentSessionDirPath,
  listAgentSessionSummaryPage,
} from "@/session/index.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import { isPluginEnabled } from "@/plugin/core/Activation.js";
import { createInstructionSystemBlocks } from "@/agent/local/AgentInstructions.js";

type AgentSessionManagerOptions = {
  /**
   * 当前 agent 稳定标识。
   */
  agent_id: string;

  /**
   * 当前项目根目录。
   */
  project_root: string;

  /**
   * 当前 agent 默认工具集合。
   */
  tools: Record<string, Tool>;

  /**
   * 当前统一日志器。
   */
  logger: Logger;

  /**
   * 当前 agent runtime。
   */
  runtime: AgentRuntime;

  /**
   * 延迟读取当前 agent context。
   */
  get_agent_context: () => AgentContext;

  /**
   * 当前静态 instruction 文本集合。
   */
  get_instruction: () => string[];

  /**
   * 当前 plugin 实例集合。
   */
  plugin_instances: Map<string, BasePlugin>;

  /**
   * 当前默认模型实例。
   */
  default_model?: AgentModel;
};

/**
 * 本地 Agent session 管理服务。
 */
export class AgentSessionManager {
  private readonly agent_id: string;
  private readonly project_root: string;
  private readonly tools: Record<string, Tool>;
  private readonly logger: Logger;
  private readonly runtime: AgentRuntime;
  private readonly get_agent_context: AgentSessionManagerOptions["get_agent_context"];
  private readonly get_instruction: AgentSessionManagerOptions["get_instruction"];
  private readonly plugin_instances: Map<string, BasePlugin>;
  private readonly default_model?: AgentModel;
  private readonly sessions_by_id = new Map<string, Session>();
  private readonly configured_session_ids = new Set<string>();
  private readonly session_collection: AgentSessionCollection;

  constructor(options: AgentSessionManagerOptions) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.tools = options.tools;
    this.logger = options.logger;
    this.runtime = options.runtime;
    this.get_agent_context = options.get_agent_context;
    this.get_instruction = options.get_instruction;
    this.plugin_instances = options.plugin_instances;
    this.default_model = options.default_model;
    this.session_collection = {
      createSession: async (input) => await this.create_session(input),
      getSession: async (session_id) => await this.get_session(session_id),
      listSessions: async (input) => await this.list_sessions(input),
    };
  }

  /**
   * 返回当前缓存的 session 实例。
   */
  list_cached_sessions(): Session[] {
    return [...this.sessions_by_id.values()];
  }

  /**
   * 返回对外暴露的 session collection。
   */
  get_session_collection(): AgentSessionCollection {
    return this.session_collection;
  }

  /**
   * 获取或创建一个 session runtime port。
   */
  get_session_port(session_id: string): SessionPort {
    return this.get_or_create_session(session_id).getRuntimePort();
  }

  /**
   * 新建一个 session。
   */
  async create_session(
    input?: AgentCreateSessionInput,
  ): Promise<AgentSession> {
    const explicit_session_id =
      String(input?.sessionId || "").trim() || undefined;
    if (
      explicit_session_id &&
      (this.sessions_by_id.has(explicit_session_id) ||
        (await fs.pathExists(
          getSdkAgentSessionDirPath(
            this.project_root,
            this.agent_id,
            explicit_session_id,
          ),
        )))
    ) {
      throw new Error(`Session "${explicit_session_id}" already exists`);
    }
    const session = this.get_or_create_session(explicit_session_id);
    await session.initialize();
    await this.apply_session_defaults(session);
    return session;
  }

  /**
   * 获取一个已存在的 session。
   */
  async get_session(session_id: string): Promise<AgentSession> {
    const resolved_session_id = String(session_id || "").trim();
    if (!resolved_session_id) {
      throw new Error("getSession requires a non-empty sessionId");
    }
    const session_dir_path = getSdkAgentSessionDirPath(
      this.project_root,
      this.agent_id,
      resolved_session_id,
    );
    if (
      !this.sessions_by_id.has(resolved_session_id) &&
      !(await fs.pathExists(session_dir_path))
    ) {
      throw new Error(`Session "${resolved_session_id}" not found`);
    }
    const session = this.get_or_create_session(resolved_session_id);
    await session.initialize();
    await this.apply_session_defaults(session);
    return session;
  }

  /**
   * 列出当前 agent 的 session 摘要页。
   */
  async list_sessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await listAgentSessionSummaryPage({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      input,
      executingSessionIds: new Set(this.runtime.listExecutingSessionIds()),
    });
  }

  private get_or_create_session(session_id?: string): Session {
    const resolved_session_id =
      String(session_id || "").trim() || `session-${Date.now()}-${nanoid(8)}`;
    const cached = this.sessions_by_id.get(resolved_session_id);
    if (cached) return cached;

    const created = new Session({
      agentId: this.agent_id,
      projectRoot: this.project_root,
      sessionId: resolved_session_id,
      tools: this.tools,
      logger: this.logger,
      getInstructionSystemBlocks: () => this.load_instruction_system_blocks(),
      getManagedPluginSystemBlocks: async () => [],
      getPluginSystemBlocks: async () => await this.load_plugin_system_blocks(),
      ensureConfigured: async (session) => {
        await this.apply_session_defaults(session);
      },
    });
    this.sessions_by_id.set(resolved_session_id, created);
    return created;
  }

  private async apply_session_defaults(session: Session): Promise<void> {
    if (this.configured_session_ids.has(session.id)) return;
    if (this.default_model) {
      await session.set({
        model: this.default_model,
      });
    }
    this.configured_session_ids.add(session.id);
  }

  private load_instruction_system_blocks(): AgentSessionSystemBlock[] {
    return createInstructionSystemBlocks(
      this.get_instruction(),
      this.project_root,
    );
  }

  private async load_plugin_system_blocks(): Promise<AgentSessionSystemBlock[]> {
    const context = this.get_agent_context();
    const out: AgentSessionSystemBlock[] = [];
    for (const plugin of this.plugin_instances.values()) {
      if (typeof plugin.system !== "function") continue;
      try {
        if (!isPluginEnabled({ plugin, context })) continue;
        if (typeof plugin.availability === "function") {
          const availability = await plugin.availability(context);
          if (!availability.available) continue;
        }
        const text = String(await plugin.system(context)).trim();
        if (!text) continue;
        out.push({
          source: "plugin",
          name: plugin.name,
          content: text,
        });
      } catch {
        // 单个 plugin system 失败不应阻断 SDK session 主链路。
      }
    }
    return out;
  }
}
