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
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { AgentPlugins } from "@/plugin/types/Plugin.js";
import type {
  AgentModel,
  AgentOptions,
  AgentSessionCollection,
} from "@/types/agent/AgentTypes.js";
import type {
  ShellApprovalMode,
  ShellApprovalDecisionResult,
  ShellApprovalModeUpdateResult,
  ShellApprovalModeOption,
  ShellSessionApprovalModeView,
  ShellApprovalView,
  Shell,
} from "@downcity/shell";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { Logger } from "@/utils/logger/Logger.js";
import { normalizeInstructionInput } from "@/agent/local/AgentInstructions.js";
import {
  AgentAssemblyService,
  type AgentAssemblyResult,
} from "@/agent/local/services/AgentAssemblyService.js";
import { AgentSessionManager } from "@/agent/local/services/AgentSessionManager.js";
import { AgentBackgroundService } from "@/agent/local/services/AgentBackgroundService.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly plugins: AgentPlugins;

  private readonly logger: Logger;
  private readonly agentContext: AgentContext;
  private readonly pluginRegistry: PluginRegistry;
  private readonly config: DowncityConfig;
  private readonly env: Record<string, string>;
  private readonly defaultModel?: AgentModel;
  private readonly SessionClass: AgentOptions["Session"];
  private readonly sessionManager: AgentSessionManager;
  private readonly backgroundService: AgentBackgroundService;
  private readonly shell?: AgentOptions["shell"];

  private instruction: string[];

  constructor(options: AgentOptions) {
    this.defaultModel = options.model;
    this.SessionClass = options.Session;
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
    this.agentContext = assembly.agent_context;
    this.pluginRegistry = assembly.plugin_registry;
    this.config = assembly.config;
    this.env = assembly.env;
    this.instruction = assembly.instruction;
    this.shell = assembly.shell;

    // 关键点（中文）：构造完成即触发后台能力启动；调用方可 `await agent.ready()` 等待。
    this.backgroundService = new AgentBackgroundService({
      logger: this.logger,
      agent_context: this.agentContext,
      get_shell: () => this.shell,
    });
    this.sessionManager = this.create_session_manager(assembly);
    session_manager_ref = this.sessionManager;
  }

  /**
   * 等待 Agent 后台能力启动完成。
   *
   * 关键点（中文）
   * - Agent 构造完成即开始启动 plugin lifecycle 与 ActionSchedule。
   * - 调用方在需要确认后台能力就绪时使用，例如启动后立刻读取 plugin 状态。
   */
  async ready(): Promise<void> {
    await this.backgroundService.ready();
  }

  /**
   * 释放当前 Agent 的后台能力。
   *
   * 关键点（中文）
   * - 关闭 plugin lifecycle、ActionSchedule、shell 等后台资源。
   * - 不负责任何 transport（RPC / HTTP）；transport 由 `@downcity/server` 自行管理。
   */
  async dispose(): Promise<void> {
    await this.backgroundService.dispose();
  }

  /**
   * 列出当前 shell pending approvals。
   */
  approvals(): ShellApprovalView[] {
    return this.shell?.approvals() || [];
  }

  /**
   * 列出当前 shell 显式设置过的 approval 模式。
   */
  approval_modes(): ShellApprovalModeOption[] {
    return this.shell?.approval_modes() || [];
  }

  /**
   * 读取当前 shell 指定 session 的 approval 模式。
   */
  approval_mode(input: { session_id: string }): ShellSessionApprovalModeView {
    if (!this.shell) throw new Error("Agent shell is not configured");
    return this.shell.approval_mode(input);
  }

  /**
   * 设置当前 shell 指定 session 的 approval 模式。
   */
  set_approval_mode(input: {
    session_id: string;
    mode: ShellApprovalMode;
  }): ShellApprovalModeUpdateResult {
    if (!this.shell) throw new Error("Agent shell is not configured");
    return this.shell.set_approval_mode(input);
  }

  /**
   * 批准当前 shell pending approval。
   */
  async approve(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    if (!this.shell) throw new Error("Agent shell is not configured");
    return await this.shell.approve(input);
  }

  /**
   * 拒绝当前 shell pending approval。
   */
  async deny(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    if (!this.shell) throw new Error("Agent shell is not configured");
    return await this.shell.deny(input);
  }

  /**
   * 更新当前 SDK Agent 的静态基础指令。
   */
  setInstruction(input: string | string[]): void {
    this.instruction = normalizeInstructionInput(input);
  }

  /**
   * 返回当前 agent env 的浅拷贝快照。
   *
   * 关键点（中文）
   * - 返回的是拷贝，调用方修改它不会影响 agent 真实状态。
   * - 想改 env 请使用 `setEnv` / `patchEnv`。
   */
  getEnv(): Record<string, string> {
    return { ...this.env };
  }

  /**
   * 整体覆盖 agent env。
   *
   * 关键点（中文）
   * - 直接清空当前共享 env 对象，再写入新值，保证 plugin / runtime / shell 看到的是同一引用。
   * - 仅写入字符串值，`null` / `undefined` 表示删除该 key。
   */
  setEnv(next: Record<string, string | null | undefined>): void {
    for (const key of Object.keys(this.env)) {
      delete this.env[key];
    }
    this.patchEnv(next);
  }

  /**
   * 增量合并 agent env。
   *
   * 关键点（中文）
   * - `null` / `undefined` 表示删除该 key；其他值会强制转字符串后写入。
   * - 修改原地生效，所有持有 `context.env` 引用的模块立即可见。
   */
  patchEnv(patch: Record<string, string | null | undefined>): void {
    if (!patch || typeof patch !== "object") return;
    for (const [raw_key, raw_value] of Object.entries(patch)) {
      const key = String(raw_key || "").trim();
      if (!key) continue;
      if (raw_value === null || raw_value === undefined) {
        delete this.env[key];
        continue;
      }
      this.env[key] = String(raw_value);
    }
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
   * 返回当前 agent context。
   */
  getContext(): AgentContext {
    return this.agentContext;
  }

  /**
   * 返回当前 session collection 入口。
   */
  session_collection(): AgentSessionCollection {
    return this.sessionManager.get_session_collection();
  }

  /**
   * 返回当前 agent 挂载的 Shell。
   */
  getShell(): Shell | undefined {
    return this.shell;
  }

  private create_session_manager(
    assembly: AgentAssemblyResult,
  ): AgentSessionManager {
    return new AgentSessionManager({
      agent_id: this.id || assembly.id,
      project_root: this.path || assembly.path,
      tools: this.tools || assembly.tools,
      logger: this.logger || assembly.logger,
      get_agent_context: () => this.agentContext ?? assembly.agent_context,
      get_instruction: () => this.instruction,
      plugin_instances: assembly.plugin_instances,
      ensure_agent_ready: async () => {
        await this.backgroundService.ready();
      },
      default_model: this.defaultModel,
      SessionClass: this.SessionClass,
    });
  }
}
