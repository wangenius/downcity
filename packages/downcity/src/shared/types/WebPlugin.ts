/**
 * Web Plugin 协议类型。
 *
 * 关键点（中文）
 * - `web` plugin 只负责选择 provider、管理少量配置，并注入对应项目的提示词。
 * - 联网能力本身由外部实现承担：`web-access` 或 `agent-browser`。
 */

import type { JsonValue } from "@/shared/types/Json.js";

/**
 * Web plugin 默认依赖仓库地址。
 */
export const WEB_PLUGIN_DEFAULT_REPOSITORY_URL =
  "https://github.com/eze-is/web-access";

/**
 * Web plugin provider。
 */
export type WebPluginProvider = "web-access" | "agent-browser";

/**
 * Web plugin 安装作用域。
 */
export type WebPluginInstallScope = "user" | "project";

/**
 * Web plugin 配置。
 */
export interface WebPluginConfig {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 是否启用 web plugin。
   */
  enabled?: boolean;
  /**
   * 当前使用的 provider。
   */
  provider?: WebPluginProvider;
  /**
   * 是否向 agent 注入 provider 提示词。
   */
  injectPrompt?: boolean;
  /**
   * provider 来源仓库地址。
   */
  repositoryUrl?: string;
  /**
   * provider 版本标签或备注。
   */
  sourceVersion?: string;
  /**
   * agent-browser 命令名（可选）。
   */
  browserCommand?: string;
  /**
   * skill 安装作用域。
   */
  installScope?: WebPluginInstallScope;
}

/**
 * 归一化后的 web plugin 配置。
 */
export interface ResolvedWebPluginConfig {
  /**
   * 最终启用态。
   */
  enabled: boolean;
  /**
   * 当前 provider。
   */
  provider: WebPluginProvider;
  /**
   * 是否注入 prompt。
   */
  injectPrompt: boolean;
  /**
   * 仓库地址。
   */
  repositoryUrl: string;
  /**
   * provider 版本标签（可选）。
   */
  sourceVersion?: string;
  /**
   * 浏览器命令。
   */
  browserCommand: string;
  /**
   * skill 安装作用域。
   */
  installScope: WebPluginInstallScope;
}

/**
 * web plugin setup/install 输入。
 */
export interface WebPluginInstallInput {
  /**
   * provider。
   */
  provider?: WebPluginProvider;
  /**
   * 是否启用 plugin。
   */
  enable?: boolean;
  /**
   * 是否注入 prompt。
   */
  injectPrompt?: boolean;
  /**
   * 来源仓库地址。
   */
  repositoryUrl?: string;
  /**
   * 版本标签。
   */
  sourceVersion?: string;
  /**
   * 浏览器命令（可选）。
   */
  browserCommand?: string;
  /**
   * 安装作用域（可选）。
   */
  installScope?: WebPluginInstallScope;
}

/**
 * web plugin 依赖检查结果。
 */
export interface WebPluginDependencyCheckResult {
  /**
   * 当前 provider 是否可用。
   */
  available: boolean;
  /**
   * 当前 provider 是否已就绪。
   */
  installed: boolean;
  /**
   * 不可用原因列表。
   */
  reasons: string[];
  /**
   * 结构化详情（可选）。
   */
  details?: JsonValue;
}
