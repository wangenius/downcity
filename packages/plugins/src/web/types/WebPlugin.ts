/**
 * WebPlugin 协议类型。
 *
 * 关键点（中文）
 * - web plugin 只注入联网方法论，不维护 provider 运行态。
 * - install action 只返回安装提示，不执行命令或修改文件。
 * - target 表示需要安装说明的联网能力，不表示 agent 运行时默认选择。
 */

import type { JsonObject } from "@downcity/agent";

/**
 * WebPlugin action 名称常量。
 */
export const WEB_PLUGIN_ACTIONS = {
  /**
   * 返回联网能力的安装操作提示。
   */
  install: "install",
} as const;

/**
 * WebPlugin 安装提示目标。
 */
export type WebPluginInstallTarget = "web-access" | "agent-browser" | "all";

/**
 * agent-browser CLI 安装作用域。
 */
export type WebPluginInstallScope = "user" | "project";

/**
 * WebPlugin install 提示 action 输入。
 */
export interface WebPluginInstallPayload {
  /**
   * 需要获取安装说明的联网能力。
   *
   * 说明（中文）
   * - `web-access`：返回 web-access Skill 的安装工作流。
   * - `agent-browser`：返回 agent-browser Skill 与 CLI 的安装工作流。
   * - `all`：返回以上全部能力的安装工作流。
   * - 默认值为 `web-access`。
   */
  target?: WebPluginInstallTarget;
  /**
   * agent-browser CLI 的安装作用域。
   *
   * 说明（中文）
   * - `user`：提示 Agent 将 CLI 安装到 npm 全局环境。
   * - `project`：提示 Agent 使用项目已有的包管理器安装 devDependency。
   * - Skill 安装位置由 SkillPlugin 的扫描配置决定，不受此字段控制。
   * - 默认值为 `user`。
   */
  scope?: WebPluginInstallScope;
}

/**
 * WebPlugin install action 返回的安装提示数据。
 */
export interface WebPluginInstallInstructions extends JsonObject {
  /**
   * 标识当前结果只包含操作说明。
   */
  kind: "instructions";
  /**
   * 已归一化的联网能力目标。
   */
  target: WebPluginInstallTarget;
  /**
   * 已归一化的 agent-browser CLI 安装作用域。
   */
  scope: WebPluginInstallScope;
  /**
   * 提供给 Agent 执行的完整安装说明。
   */
  prompt: string;
}
