/**
 * Session Composer 配置类型。
 *
 * 关键点（中文）
 * - Composer 是 session 执行阶段的可替换策略对象。
 * - 调用方可以传入现成实例，也可以传入 factory 为每个 session 创建独立实例。
 * - factory 适合 history/system 等可能绑定 sessionId、historyStore 或 session 元信息的 composer。
 */

import type { Tool } from "ai";
import type { SessionCompactionComposer } from "@/executor/composer/compaction/SessionCompactionComposer.js";
import type { SessionContextComposer } from "@/executor/composer/context/SessionContextComposer.js";
import type { SessionHistoryComposer } from "@/executor/composer/history/SessionHistoryComposer.js";
import type { SessionSystemComposer } from "@/executor/composer/system/SessionSystemComposer.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { AgentSessionSystemBlock } from "@/types/agent/SessionTypes.js";

/**
 * 单个 session 创建 Composer 时可读取的稳定上下文。
 */
export interface SessionComposerFactoryContext {
  /**
   * 当前 agent 的稳定标识。
   */
  agentId: string;

  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;

  /**
   * 当前 session 对应的 history 事实源。
   *
   * 关键点（中文）
   * - history composer 和 compaction composer 通常需要基于它读取或压缩历史。
   * - factory 每次收到的都是当前 session 自己的 store。
   */
  historyStore: SessionHistoryStore;

  /**
   * 当前 agent 默认工具集合读取器。
   */
  getTools: () => Record<string, Tool>;

  /**
   * 读取当前 SDK 调用方传入的 instruction system blocks。
   */
  getInstructionSystemBlocks: () => AgentSessionSystemBlock[];

  /**
   * 读取当前 agent 显式注入的受托管 plugin system blocks。
   */
  getManagedPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前 agent 显式注册 plugin 的 system blocks。
   */
  getPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前 session 首次创建时间（ms）。
   */
  getSessionCreatedAt: () => number;

  /**
   * 读取当前 session 初始化时解析到的系统时区。
   */
  getSessionTimezone: () => string;
}

/**
 * 可直接传入 composer 实例，也可传入按 session 创建 composer 的 factory。
 */
export type SessionComposerInput<TComposer> =
  | TComposer
  | ((context: SessionComposerFactoryContext) => TComposer);

/**
 * Session Composer 覆盖项。
 */
export interface SessionComposerOptions {
  /**
   * 覆盖本轮 system messages 的 composer。
   */
  systemComposer?: SessionComposerInput<SessionSystemComposer>;

  /**
   * 覆盖本轮 history messages 的 composer。
   */
  historyComposer?: SessionComposerInput<SessionHistoryComposer>;

  /**
   * 覆盖本轮 tools、step hooks、fallback assistant message 等运行上下文 composer。
   */
  contextComposer?: SessionComposerInput<SessionContextComposer>;

  /**
   * 覆盖本轮上下文压缩 composer。
   */
  compactionComposer?: SessionComposerInput<SessionCompactionComposer>;
}
