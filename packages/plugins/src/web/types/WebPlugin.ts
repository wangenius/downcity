/**
 * WebPlugin 协议类型。
 *
 * 关键点（中文）
 * - web plugin 只注入联网方法论，不维护 provider 运行态。
 * - install action 仅用于准备联网相关 skill 与工具依赖。
 * - target 表示要准备的联网能力，不表示 agent 运行时默认选择。
 */

import type { JsonValue } from "@downcity/agent/internal/types/common/Json.js";

/**
 * WebPlugin 可安装目标。
 */
export type WebPluginInstallTarget = "web-access" | "agent-browser" | "all";

/**
 * WebPlugin 安装作用域。
 */
export type WebPluginInstallScope = "user" | "project";

/**
 * WebPlugin install action 输入。
 */
export interface WebPluginInstallPayload {
  /**
   * 要准备的联网能力。
   *
   * 说明（中文）
   * - `web-access`：安装 web-access skill。
   * - `agent-browser`：安装 agent-browser skill，并准备 agent-browser CLI 包。
   * - `all`：同时准备以上能力。
   * - 默认值为 `web-access`，避免默认安装额外 CLI。
   */
  target?: WebPluginInstallTarget;
  /**
   * 安装作用域。
   *
   * 说明（中文）
   * - `user`：安装到用户级 skill / npm 全局环境。
   * - `project`：安装到当前项目级 skill / devDependency。
   * - 默认值为 `user`，避免默认修改项目依赖。
   */
  scope?: WebPluginInstallScope;
  /**
   * 是否跳过安装确认。
   *
   * 说明（中文）
   * - 会透传给底层 skill installer。
   * - 默认值为 `true`，适合 agent 自动执行。
   */
  yes?: boolean;
  /**
   * skill installer 的目标 agent 名称。
   *
   * 说明（中文）
   * - 默认使用 `claude-code`，与现有 SkillPlugin 安装行为保持一致。
   */
  agent?: string;
  /**
   * 允许保留额外 JSON 字段，便于未来扩展安装器参数。
   */
  [key: string]: JsonValue | undefined;
}

