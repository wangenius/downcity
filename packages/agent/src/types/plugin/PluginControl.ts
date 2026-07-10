/**
 * Plugin 控制面协议类型。
 *
 * 关键点（中文）
 * - CLI、HTTP 与 RPC 共用同一套 plugin 控制请求和响应结构。
 * - 状态数据统一复用 `PluginSnapshot`，不再复制字段或保留旧别名。
 */

import type { JsonValue } from "@/types/common/Json.js";
import type { PluginControlAction, PluginSnapshot } from "@/types/plugin/PluginState.js";

export type { PluginControlAction } from "@/types/plugin/PluginState.js";

/**
 * plugin 状态列表响应。
 */
export type PluginStateListResponse = {
  /** 请求是否成功。 */
  success: boolean;
  /** 当前已注册 plugin 快照。 */
  plugins?: PluginSnapshot[];
  /** 失败原因。 */
  error?: string;
};

/**
 * 单个 plugin 控制响应。
 */
export type PluginControlResponse = {
  /** 请求是否成功。 */
  success: boolean;
  /** 当前 plugin 快照。 */
  plugin?: PluginSnapshot;
  /** 失败原因。 */
  error?: string;
};

/**
 * plugin command/action 执行响应。
 */
export type PluginCommandResponse = {
  /** 调用是否成功。 */
  success: boolean;
  /** 当前 plugin 快照。 */
  plugin?: PluginSnapshot;
  /** 人类可读结果。 */
  message?: string;
  /** 结构化结果。 */
  data?: JsonValue;
  /** 失败原因。 */
  error?: string;
};

/**
 * plugin CLI 通用选项。
 */
export type PluginCliBaseOptions = {
  /** agent 项目路径。 */
  path?: string;
  /** 目标 agent 标识。 */
  agent?: string;
  /** HTTP 主机。 */
  host?: string;
  /** HTTP 端口。 */
  port?: number;
  /** 控制面认证令牌。 */
  token?: string;
  /** 是否输出 JSON。 */
  json?: boolean;
};

/**
 * plugin 控制请求。
 */
export type PluginControlRequest = {
  /** 目标 plugin 名称。 */
  plugin_name: string;
  /** 控制动作。 */
  action: PluginControlAction;
};
