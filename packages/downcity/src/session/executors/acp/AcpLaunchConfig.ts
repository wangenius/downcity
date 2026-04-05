/**
 * ACP session 支撑函数。
 *
 * 关键点（中文）
 * - 统一收敛 `execution.type=acp` 配置解析。
 * - 只支持 Codex / Claude / Kimi 三类 coding agent。
 * - 默认命令允许被项目配置覆盖，避免绑定单一安装方式。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { AcpExecutionAgentConfig } from "@/shared/types/ExecutionBinding.js";
import type { SessionAgentType } from "@/shared/types/SessionAgent.js";

/**
 * 标准化后的 ACP 启动配置。
 */
export interface ResolvedAcpLaunchConfig {
  /**
   * agent 类型。
   */
  type: SessionAgentType;

  /**
   * 最终启动命令。
   */
  command: string;

  /**
   * 最终启动参数。
   */
  args: string[];

  /**
   * 额外环境变量。
   */
  env: Record<string, string>;
}

/**
 * 读取项目 ACP agent 配置。
 */
export function readEnabledSessionAgentConfig(
  config: DowncityConfig,
): AcpExecutionAgentConfig | null {
  const execution = config.execution;
  if (!execution || typeof execution !== "object") return null;
  if (execution.type !== "acp") return null;
  const agent = execution.agent;
  if (!agent || typeof agent !== "object") return null;
  if (!isSupportedSessionAgentType(agent.type)) return null;
  return agent;
}

/**
 * 解析 ACP 启动命令。
 */
export function resolveAcpLaunchConfig(
  config: AcpExecutionAgentConfig,
): ResolvedAcpLaunchConfig {
  const defaults = resolveDefaultAcpCommand(config.type);
  const command = String(config.command || "").trim() || defaults.command;
  if (!command) {
    throw new Error(`ACP agent command is required for type: ${config.type}`);
  }

  const args =
    Array.isArray(config.args) && config.args.length > 0
      ? config.args
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : defaults.args;

  return {
    type: config.type,
    command,
    args,
    env: normalizeStringMap(config.env),
  };
}

/**
 * 返回内置默认 ACP 命令。
 */
export function resolveDefaultAcpCommand(type: SessionAgentType): {
  command: string;
  args: string[];
} {
  if (type === "kimi") {
    return {
      command: "kimi",
      args: ["acp"],
    };
  }
  if (type === "claude") {
    return {
      command: "npx",
      args: ["-y", "@zed-industries/claude-code-acp"],
    };
  }
  return {
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
  };
}

function isSupportedSessionAgentType(value: unknown): value is SessionAgentType {
  return value === "codex" || value === "claude" || value === "kimi";
}

function normalizeStringMap(
  input: Record<string, string> | undefined,
): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    output[key] = String(rawValue ?? "");
  }
  return output;
}
