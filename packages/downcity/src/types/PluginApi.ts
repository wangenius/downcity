/**
 * plugin 管理命令与 API 类型。
 *
 * 关键点（中文）
 * - 统一描述 CLI -> daemon 的 plugin 管理协议。
 * - 当前阶段支持 list / availability / action 三类调用。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * Plugin 运行时视图。
 */
export interface PluginView {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * 已声明的 Action 名称列表。
   */
  actions: string[];
  /**
   * 已声明的 Capability 名称列表。
   */
  capabilities: string[];
  /**
   * 依赖的 Asset 名称列表。
   */
  requiredAssets: string[];
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
  /**
   * 缺失的 Asset 名称列表（可选）。
   */
  missingAssets?: string[];
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
   * 是否输出 JSON。
   */
  json?: boolean;
  /**
   * agent 名称（从 console registry 解析到项目路径）。
   */
  agent?: string;
}
