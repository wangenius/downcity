/**
 * plugin 管理命令与 API 类型。
 *
 * 关键点（中文）
 * - 统一描述 CLI -> daemon 的 plugin 管理协议。
 * - 当前阶段支持 list / availability / action 三类调用。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * Plugin 概览视图。
 */
export interface PluginView {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * Plugin 展示标题。
   */
  title: string;
  /**
   * Plugin 面向人类的用途说明。
   */
  description: string;
  /**
   * 已声明的 Action 名称列表。
   */
  actions: string[];
  /**
   * 已声明的 pipeline 点名称列表。
   */
  pipelines: string[];
  /**
   * 已声明的 guard 点名称列表。
   */
  guards: string[];
  /**
   * 已声明的 effect 点名称列表。
   */
  effects: string[];
  /**
   * 已声明的 resolve 点名称列表。
   */
  resolves: string[];
  /**
   * 是否声明了 system 注入。
   */
  hasSystem: boolean;
  /**
   * 是否声明了 availability 检查。
   */
  hasAvailability: boolean;
}

/**
 * Plugin 可用性响应视图。
 */
export interface PluginAvailabilityView {
  /**
   * Plugin 是否启用。
   */
  enabled: boolean;
  /**
   * Plugin 当前是否可用。
   */
  available: boolean;
  /**
   * 不可用原因列表。
   */
  reasons: string[];
}

/**
 * plugin list 响应。
 */
export interface PluginListResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;
  /**
   * Plugin 列表（可选）。
   */
  plugins?: PluginView[];
  /**
   * 错误信息（可选）。
   */
  error?: string;
}

/**
 * plugin availability 响应。
 */
export interface PluginAvailabilityResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;
  /**
   * Plugin 名称（可选）。
   */
  pluginName?: string;
  /**
   * Plugin 可用性视图（可选）。
   */
  availability?: PluginAvailabilityView;
  /**
   * 错误信息（可选）。
   */
  error?: string;
}

/**
 * plugin action 响应。
 */
export interface PluginActionResponse {
  /**
   * Action 是否成功。
   */
  success: boolean;
  /**
   * Plugin 名称（可选）。
   */
  pluginName?: string;
  /**
   * Action 名称（可选）。
   */
  actionName?: string;
  /**
   * 返回数据（可选）。
   */
  data?: JsonValue;
  /**
   * 人类可读消息（可选）。
   */
  message?: string;
  /**
   * 错误信息（可选）。
   */
  error?: string;
}

/**
 * plugin CLI 通用选项。
 */
export interface PluginCliBaseOptions {
  /**
   * agent 项目路径（默认当前目录）。
   */
  path?: string;
  /**
   * 覆盖服务主机地址。
   */
  host?: string;
  /**
   * 覆盖服务端口。
   */
  port?: number;
  /**
   * 显式覆盖 Bearer Token。
   */
  token?: string;
  /**
   * 是否输出 JSON。
   */
  json?: boolean;
  /**
   * agent 名称（从 console registry 解析到项目路径）。
   */
  agent?: string;
}
