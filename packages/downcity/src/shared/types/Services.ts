/**
 * service 管理命令类型。
 *
 * 关键点（中文）
 * - 统一描述 CLI -> daemon 的 service 管理协议
 * - 支持 lifecycle 控制与通用 command 转发
 */

import type { JsonValue } from "@/shared/types/Json.js";

export type ServiceControlAction = "start" | "stop" | "restart" | "status";

/**
 * 单个 service 的对外状态视图。
 */
export type ServiceStateView = {
  /** service 稳定名称。 */
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
  /** 当前 service 是否支持显式 start/stop 生命周期控制。 */
  supportsLifecycle: boolean;
  /** 当前 service 是否支持 command/action 调用。 */
  supportsCommand: boolean;
};

/**
 * service 列表响应。
 */
export type ServiceListResponse = {
  /** 本次读取是否成功。 */
  success: boolean;
  /** 成功时返回的 service 状态列表。 */
  services?: ServiceStateView[];
  /** 失败时返回的错误信息。 */
  error?: string;
};

/**
 * service 生命周期控制响应。
 */
export type ServiceControlResponse = {
  /** 本次控制动作是否成功。 */
  success: boolean;
  /** 成功时返回最新的 service 状态视图。 */
  service?: ServiceStateView;
  /** 失败时的错误信息。 */
  error?: string;
};

/**
 * service command/action 执行响应。
 */
export type ServiceCommandResponse = {
  /** 本次 command/action 是否执行成功。 */
  success: boolean;
  /** 当前 service 的最新状态视图。 */
  service?: ServiceStateView;
  /** 面向人类可读的补充文本。 */
  message?: string;
  /** command/action 的数据输出。 */
  data?: JsonValue;
  /** 失败时的错误信息。 */
  error?: string;
};

export type ServiceCliBaseOptions = {
  /**
   * agent 项目路径（默认当前目录）。
   */
  path?: string;
  /**
   * agent 名称（从 console registry 解析到项目路径）。
   */
  agent?: string;
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
};
