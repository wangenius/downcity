/**
 * Session agent 配置类型定义。
 *
 * 关键点（中文）
 * - 该配置只影响 session 执行层，不替代 console 全局模型池。
 * - 当前仅收敛 3 类 ACP coding agent：Codex、Claude、Kimi。
 * - `command/args` 允许覆盖默认启动命令，兼容本地不同安装方式。
 */

/**
 * 支持的 ACP agent 类型。
 */
export type SessionAgentType = "codex" | "claude" | "kimi";

/**
 * 单个 ACP session agent 配置。
 */
export interface SessionAgentConfig {
  /**
   * 是否启用该 session agent。
   *
   * 说明（中文）
   * - 未显式配置时默认视为启用。
   * - 设为 `false` 时仍会回退到原有 AI SDK session runtime。
   */
  enabled?: boolean;

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
   * - 用于适配本机已安装的自定义 wrapper / adapter。
   */
  command?: string;

  /**
   * 自定义启动参数列表。
   *
   * 说明（中文）
   * - 留空时按 `type` 使用内置默认参数。
   * - 写入后会完全覆盖默认参数。
   */
  args?: string[];

  /**
   * 启动该 ACP agent 时额外注入的环境变量。
   *
   * 说明（中文）
   * - 仅作用于子进程，不会回写当前 agent 进程环境。
   * - 常用于 adapter 额外开关或本地调试。
   */
  env?: Record<string, string>;
}

/**
 * Session 层配置。
 */
export interface SessionConfig {
  /**
   * Session 执行时使用的 ACP agent 配置。
   *
   * 说明（中文）
   * - 配置后，session 执行会优先走 ACP runtime。
   * - 未配置时，仍使用原有基于 AI SDK 的 session runtime。
   */
  agent?: SessionAgentConfig;
}
