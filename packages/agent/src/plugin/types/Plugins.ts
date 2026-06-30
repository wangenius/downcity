/**
 * plugin 管理命令类型。
 */

import type { JsonValue } from "@/types/common/Json.js";

export type PluginControlAction = "status" | "unregister";

/**
 * 单个 plugin 的对外状态视图。
 */
export type PluginStateView = {
  /** plugin 稳定名称。 */
  name: string;
  /** 当前注册状态。 */
  state: "ready" | "error";
  /** 当前注册状态。 */
  status: "ready" | "error";
  /** 注册时间（毫秒时间戳）。 */
  registered_at: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updated_at: number;
  /** 兼容旧字段的最近一次状态更新时间。 */
  updatedAt: number;
  /** 最近一次错误信息。 */
  lastError?: string;
  /** 最近一次错误信息。 */
  last_error?: string;
};

/**
 * plugin 状态列表响应。
 */
export type PluginStateListResponse = {
  success: boolean;
  plugins?: PluginStateView[];
  error?: string;
};

/**
 * plugin 生命周期控制响应。
 */
export type PluginControlResponse = {
  success: boolean;
  plugin?: PluginStateView;
  error?: string;
};

/**
 * plugin command/action 执行响应。
 */
export type PluginCommandResponse = {
  success: boolean;
  plugin?: PluginStateView;
  message?: string;
  data?: JsonValue;
  error?: string;
};

export type PluginCliBaseOptions = {
  path?: string;
  agent?: string;
  host?: string;
  port?: number;
  token?: string;
  json?: boolean;
};
