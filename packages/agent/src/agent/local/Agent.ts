/**
 * Agent local：本地入口与 facade。
 *
 * 职责说明（中文）
 * - 对外暴露 `Agent` 这一唯一的本地实例类。
 * - facade 只保留公开 API 与 service 组合，不再直接承载装配、session 管理与生命周期细节。
 * - 单个 agent 的长期对象装配、session 管理、后台能力生命周期分别下沉到独立 service。
 */

import type { Tool } from "ai";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { PluginPort } from "@/plugin/types/Plugin.js";
import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentModel,
  AgentOptions,
  AgentSession,
  AgentSessionCollection,
  AgentSessionSummaryPage,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
} from "@/types/agent/AgentTypes.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { Logger } from "@/utils/logger/Logger.js";
import { normalizeInstructionInput } from "@/agent/local/AgentInstructions.js";
import {
  AgentAssemblyService,
  type AgentAssemblyResult,
} from "@/agent/local/services/AgentAssemblyService.js";
import { AgentSessionManager } from "@/agent/local/services/AgentSessionManager.js";
import { AgentLifecycleService } from "@/agent/local/services/AgentLifecycleService.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly plugins: PluginPort;

  private readonly logger: Logger;
  private readonly runtime: AgentRuntime;
  private readonly agentContext: AgentContext;
  private readonly pluginRegistry: PluginRegistry;
  private readonly config: DowncityConfig;
  private readonly env: Record<string, string>;
  private readonly defaultModel?: AgentModel;
  private readonly sessionManager: AgentSessionManager;
  private readonly lifecycleService: AgentLifecycleService;

  private instruction: string[];

  constructor(options: AgentOptions) {
    this.defaultModel = options.model;
    let session_manager_ref: AgentSessionManager | null = null;
    const assembly_service = new AgentAssemblyService({
      options,
      list_cached_sessions: () => session_manager_ref?.list_cached_sessions() || [],
      get_session_port: (session_id) => {
        if (!session_manager_ref) {
          throw new Error("Agent session manager is not initialized");
        }
        return session_manager_ref.get_session_port(session_id);
      },
      resolve_session_model: async (session_id) => {
        if (!session_manager_ref) return undefined;
        const session = await session_manager_ref.get_session(session_id);
        return session.config.model;
      },
    });
    const assembly = assembly_service.assemble();

    this.id = assembly.id;
    this.path = assembly.path;
    this.tools = assembly.tools;
    this.plugins = assembly.plugins;
    this.logger = assembly.logger;
    this.runtime = assembly.runtime;
    this.agentContext = assembly.agent_context;
    this.pluginRegistry = assembly.plugin_registry;
    this.config = assembly.config;
    this.env = assembly.env;
    this.instruction = assembly.instruction;

    this.sessionManager = this.create_session_manager(assembly);
    session_manager_ref = this.sessionManager;
    this.lifecycleService = new AgentLifecycleService({
      logger: this.logger,
      agent_context: this.agentContext,
      session_collection: this.sessionManager.get_session_collection(),
      get_runtime: () => this.runtime,
    });
  }

  /**
   * 新建一个 session。
   */
  async createSession(input?: AgentCreateSessionInput): Promise<AgentSession> {
    return await this.sessionManager.create_session(input);
  }

  /**
   * 获取一个已存在的 session。
   */
  async getSession(sessionId: string): Promise<AgentSession> {
    return await this.sessionManager.get_session(sessionId);
  }

  /**
   * 列出当前 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await this.sessionManager.list_sessions(input);
  }

  /**
   * 启动当前 agent 实例的长期运行能力。
   */
  async start(options?: AgentStartOptions): Promise<AgentStartResult> {
    return await this.lifecycleService.start(options);
  }

  /**
   * 停止当前 agent 实例的长期运行能力。
   */
  async stop(): Promise<AgentStopResult> {
    return await this.lifecycleService.stop();
  }

  /**
   * 更新当前 SDK Agent 的静态基础指令。
   */
  setInstruction(input: string | string[]): void {
    this.instruction = normalizeInstructionInput(input);
  }

  /**
   * 返回当前项目根目录解析后的配置快照。
   */
  getConfig(): DowncityConfig {
    return this.config;
  }

  /**
   * 返回当前 agent 绑定的统一日志器。
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 返回当前 agent runtime。
   */
  getRuntime(): AgentRuntime {
    return this.runtime;
  }

  /**
   * 返回当前 agent context。
   */
  getContext(): AgentContext {
    return this.agentContext;
  }

  /**
   * 返回当前 session collection。
   */
  getSessionCollection(): AgentSessionCollection {
    return this.sessionManager.get_session_collection();
  }

  private create_session_manager(
    assembly: AgentAssemblyResult,
  ): AgentSessionManager {
    return new AgentSessionManager({
      agent_id: this.id || assembly.id,
      project_root: this.path || assembly.path,
      tools: this.tools || assembly.tools,
      logger: this.logger || assembly.logger,
      runtime: this.runtime || assembly.runtime,
      get_agent_context: () => this.agentContext || assembly.agent_context,
      get_instruction: () => this.instruction,
      plugin_instances: assembly.plugin_instances,
      default_model: this.defaultModel,
    });
  }
}
