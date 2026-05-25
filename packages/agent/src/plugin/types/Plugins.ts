/**
 * plugin 管理命令类型。
 */

import type { JsonValue } from "@/types/common/Json.js";

export type PluginControlAction = "start" | "stop" | "restart" | "status";

/**
 * 单个 plugin 的对外状态视图。
 */
export type PluginStateView = {
  /** plugin 稳定名称。 */
  name: string;
  /** 当前运行状态。 */
  state: "running" | "stopped" | "starting" | "stopping" | "error";
  /** 最近一次状态更新时间（毫秒时间戳）。 */
  updatedAt: number;
  /** 最近一次错误信息。 */
  lastError?: string;
  /** 最近一次执行的命令名称。 */
  lastCommand?: string;
  /** 最近一次执行命令的时间（毫秒时间戳）。 */
  lastCommandAt?: number;
  /** 当前 plugin 是否支持显式 start/stop 生命周期控制。 */
  supportsLifecycle: boolean;
  /** 当前 plugin 是否支持 command/action 调用。 */
  supportsCommand: boolean;
};

/**
 * plugin 列表响应。
 */
export type PluginListResponse = {
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
