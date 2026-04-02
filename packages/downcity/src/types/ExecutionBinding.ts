/**
 * 项目执行绑定类型定义。
 *
 * 关键点（中文）
 * - 项目运行入口只允许两类执行模式：`model` 或 `acp`。
 * - `model` 模式仅保存 console 全局模型池中的模型 ID。
 * - `acp` 模式仅保存 ACP coding agent 所需的最小启动配置。
 * - 该类型是项目 `downcity.json` 中唯一的执行配置来源。
 */

import type { SessionAgentType } from "@/types/SessionAgent.js";

/**
 * 支持的执行模式。
 */
export type ExecutionBindingMode = "model" | "acp";

/**
 * ACP agent 启动配置。
 */
export interface AcpExecutionAgentConfig {
  /**
   * ACP agent 类型。
   *
   * 说明（中文）
   * - `codex`：默认走 Codex ACP adapter。
   * - `claude`：默认走 Claude ACP adapter。
   * - `kimi`：默认走 `kimi acp`。
   */
  type: SessionAgentType;

  /**
   * 自定义启动命令。
   *
   * 说明（中文）
   * - 留空时按 `type` 使用内置默认命令。
   * - 用于适配本机已安装的 wrapper / adapter。
   */
  command?: string;

  /**
   * 自定义启动参数列表。
   *
   * 说明（中文）
   * - 留空时按 `type` 使用内置默认参数。
   * - 一旦写入，会完整覆盖默认参数。
   */
  args?: string[];

  /**
   * 启动该 ACP agent 时额外注入的环境变量。
   *
   * 说明（中文）
   * - 仅作用于子进程，不会回写当前 agent 进程环境。
   */
  env?: Record<string, string>;
}

/**
 * 基于 console 模型池的执行配置。
 */
export interface ModelExecutionBindingConfig {
  /**
   * 执行模式类型。
   */
  type: "model";

  /**
   * console 全局模型池中的模型 ID。
   *
   * 说明（中文）
   * - 必须能在 `~/.downcity/downcity.db` 的模型池中解析到。
   * - 例如：`default`、`fast`、`quality`。
   */
  modelId: string;
}

/**
 * 基于 ACP coding agent 的执行配置。
 */
export interface AcpExecutionBindingConfig {
  /**
   * 执行模式类型。
   */
  type: "acp";

  /**
   * ACP agent 配置。
   */
  agent: AcpExecutionAgentConfig;
}

/**
 * 项目执行绑定联合类型。
 */
export type ExecutionBindingConfig =
  | ModelExecutionBindingConfig
  | AcpExecutionBindingConfig;
