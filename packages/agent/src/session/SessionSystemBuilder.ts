/**
 * SDK Session 默认 system composer。
 *
 * 关键点（中文）
 * - 面向 `Agent` SDK 的本地会话执行场景。
 * - 注入调用方显式传入的静态 instruction、受托管 plugin system 与显式注册 plugin system。
 * - SDK 不在 system 中注入动态变量；动态上下文应由调用方放入 user message。
 */

import type { SessionSystemComposer } from "@executor/composer/system/SessionSystemComposer.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type {
  AgentSessionSystemBlock,
  AgentSessionSystemSessionInfo,
} from "@/types/agent/SessionTypes.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

/**
 * 解析 SDK session system blocks 的输入。
 */
export interface BuildSessionSystemBlocksParams {
  /**
   * 当前 agent 的稳定标识。
   */
  agentId: string;

  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 当前 session 首次创建时间（ms）。
   */
  createdAt: number;

  /**
   * 当前 session 初始化时解析到的系统时区。
   */
  timezone: string;

  /**
   * 读取当前 SDK 调用方传入的 instruction system blocks。
   */
  getInstructionSystemBlocks: () => AgentSessionSystemBlock[];

  /**
   * 读取当前显式注入的受托管 plugin system blocks。
   */
  getManagedPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前显式注册 plugin 的 system blocks。
   */
  getPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;
}

type SessionSystemBuilderOptions = {
  /**
   * 当前 agent 的稳定标识。
   */
  agentId: string;

  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 读取当前 session 首次创建时间（ms）。
   */
  getSessionCreatedAt: () => number;

  /**
   * 读取当前 session 初始化时解析到的系统时区。
   */
  getSessionTimezone: () => string;

  /**
   * 读取当前 SDK 调用方传入的 instruction system blocks。
   */
  getInstructionSystemBlocks: () => AgentSessionSystemBlock[];

  /**
   * 读取当前显式注册 plugin 的 system blocks。
   */
  getPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前显式注入的受托管 plugin system blocks。
   */
  getManagedPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;
};

function normalizeSystemBlocks(
  blocks: AgentSessionSystemBlock[],
): AgentSessionSystemBlock[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      const content = String(block?.content || "").trim();
      if (!content) return null;
      const source = block.source;
      if (
        source !== "core" &&
        source !== "instruction" &&
        source !== "plugin" &&
        source !== "session"
      ) {
        return null;
      }
      return {
        source,
        name: String(block.name || source).trim() || source,
        content,
      } satisfies AgentSessionSystemBlock;
    })
    .filter((block): block is AgentSessionSystemBlock => Boolean(block));
}

function createSessionInfo(
  params: Pick<
    BuildSessionSystemBlocksParams,
    "agentId" | "sessionId" | "projectRoot" | "createdAt" | "timezone"
  >,
): AgentSessionSystemSessionInfo {
  const createdAt = Number.isFinite(params.createdAt) ? params.createdAt : 0;
  return {
    agentId: String(params.agentId || "").trim(),
    sessionId: String(params.sessionId || "").trim(),
    projectRoot: String(params.projectRoot || "").trim(),
    createdAt: new Date(createdAt).toISOString(),
    timezone: String(params.timezone || "").trim() || "UTC",
  };
}

function createSessionSystemBlock(
  session: AgentSessionSystemSessionInfo,
): AgentSessionSystemBlock {
  const content = [
    "当前会话上下文：",
    `你正在服务 agent "${session.agentId}" 的 session "${session.sessionId}"。`,
    `当前项目根目录是 "${session.projectRoot}"。`,
    `本会话创建于 ${session.createdAt}，参考时区是 ${session.timezone}。`,
    "这个创建时间是当前会话的稳定参考时间，不代表每轮运行时的当前时间。",
    "如果用户消息中提供了新的当前时间、相对时间或其他动态上下文，应优先使用用户消息中的动态信息。",
  ].join("\n");
  return {
    source: "session",
    name: "context",
    content,
  };
}

/**
 * 解析 SDK session 当前生效的 system blocks。
 */
export async function buildSessionSystemBlocks(
  params: BuildSessionSystemBlocksParams,
): Promise<AgentSessionSystemBlock[]> {
  const agentId = String(params.agentId || "").trim();
  const projectRoot = String(params.projectRoot || "").trim();
  const sessionId = String(params.sessionId || "").trim();
  const createdAt = Number(params.createdAt || 0);
  const timezone = String(params.timezone || "").trim();
  if (!agentId) {
    throw new Error("buildSessionSystemBlocks requires a non-empty agentId");
  }
  if (!projectRoot) {
    throw new Error("buildSessionSystemBlocks requires a non-empty projectRoot");
  }
  if (!sessionId) {
    throw new Error("buildSessionSystemBlocks requires a non-empty sessionId");
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    throw new Error("buildSessionSystemBlocks requires a valid createdAt");
  }
  if (!timezone) {
    throw new Error("buildSessionSystemBlocks requires a non-empty timezone");
  }
  return [
    ...normalizeSystemBlocks(params.getInstructionSystemBlocks()),
    ...normalizeSystemBlocks(await params.getManagedPluginSystemBlocks()),
    ...normalizeSystemBlocks(await params.getPluginSystemBlocks()),
    // session block 放在最后，尽量保留前缀 system blocks 的跨 session 缓存命中。
    createSessionSystemBlock(
      createSessionInfo({ agentId, projectRoot, sessionId, createdAt, timezone }),
    ),
  ];
}

/**
 * 解析 SDK session 当前生效的 system messages。
 */
export async function buildSessionSystemMessages(
  params: BuildSessionSystemBlocksParams,
): Promise<SessionSystemMessage[]> {
  const blocks = await buildSessionSystemBlocks(params);
  return blocks.map((block) => ({
    role: "system" as const,
    content: block.content,
  }));
}

/**
 * SDK Session system composer 实现。
 */
export class SessionSystemBuilder implements SessionSystemComposer {
  readonly name = "sdk_prompt_system";

  private readonly agentId: string;
  private readonly projectRoot: string;
  private readonly getSessionCreatedAt: SessionSystemBuilderOptions["getSessionCreatedAt"];
  private readonly getSessionTimezone: SessionSystemBuilderOptions["getSessionTimezone"];
  private readonly getInstructionSystemBlocks: SessionSystemBuilderOptions["getInstructionSystemBlocks"];
  private readonly getManagedPluginSystemBlocks: SessionSystemBuilderOptions["getManagedPluginSystemBlocks"];
  private readonly getPluginSystemBlocks: SessionSystemBuilderOptions["getPluginSystemBlocks"];

  constructor(options: SessionSystemBuilderOptions) {
    this.agentId = String(options.agentId || "").trim();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.getSessionCreatedAt = options.getSessionCreatedAt;
    this.getSessionTimezone = options.getSessionTimezone;
    this.getInstructionSystemBlocks = options.getInstructionSystemBlocks;
    this.getManagedPluginSystemBlocks = options.getManagedPluginSystemBlocks;
    this.getPluginSystemBlocks = options.getPluginSystemBlocks;
    if (!this.agentId) {
      throw new Error("SessionSystemBuilder requires a non-empty agentId");
    }
    if (!this.projectRoot) {
      throw new Error("SessionSystemBuilder requires a non-empty projectRoot");
    }
  }

  /**
   * 解析本轮 SDK session system messages。
   */
  async resolve(run_context: SessionRunContext) {
    const sessionId = String(run_context.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("SessionSystemBuilder.resolve requires a non-empty sessionId");
    }
    return await buildSessionSystemMessages({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId,
      createdAt: this.getSessionCreatedAt(),
      timezone: this.getSessionTimezone(),
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: async () =>
        run_context.agentPlugins
          ? await run_context.agentPlugins.systemBlocks(run_context)
          : await this.getPluginSystemBlocks(),
    });
  }
}
