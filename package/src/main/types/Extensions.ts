/**
 * extension 管理命令类型。
 *
 * 关键点（中文）
 * - 统一描述 CLI -> daemon 的 extension 管理协议。
 * - 支持 lifecycle 控制与通用 command 转发。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * Extension lifecycle 控制动作。
 */
export type ExtensionControlAction = "start" | "stop" | "restart" | "status";

/**
 * Extension runtime 视图（用于 CLI/API 输出）。
 */
export type ExtensionRuntimeView = {
  /**
   * Extension 名称。
   */
  name: string;
  /**
   * 当前运行状态。
   */
  state: "running" | "stopped" | "starting" | "stopping" | "error";
  /**
   * 最近一次状态更新时间（epoch ms）。
   */
  updatedAt: number;
  /**
   * 最近一次错误信息（可选）。
   */
  lastError?: string;
  /**
   * 最近一次执行命令名称（可选）。
   */
  lastCommand?: string;
  /**
   * 最近一次执行命令时间（epoch ms，可选）。
   */
  lastCommandAt?: number;
  /**
   * 是否支持生命周期控制。
   */
  supportsLifecycle: boolean;
  /**
   * 是否支持 command/action 调用。
   */
  supportsCommand: boolean;
};

/**
 * Extension 列表响应。
 */
export type ExtensionListResponse = {
  /**
   * 是否成功。
   */
  success: boolean;
  /**
   * Extension 列表（成功时可选）。
   */
  extensions?: ExtensionRuntimeView[];
  /**
   * 错误信息（失败时可选）。
   */
  error?: string;
};

/**
 * Extension 控制响应。
 */
export type ExtensionControlResponse = {
  /**
   * 是否成功。
   */
  success: boolean;
  /**
   * 当前 extension 状态快照（可选）。
   */
  extension?: ExtensionRuntimeView;
  /**
   * 错误信息（失败时可选）。
   */
  error?: string;
};

/**
 * Extension command 响应。
 */
export type ExtensionCommandResponse = {
  /**
   * 是否成功。
   */
  success: boolean;
  /**
   * 当前 extension 状态快照（可选）。
   */
  extension?: ExtensionRuntimeView;
  /**
   * 提示消息（可选）。
   */
  message?: string;
  /**
   * 业务数据（可选）。
   */
  data?: JsonValue;
  /**
   * 错误信息（可选）。
   */
  error?: string;
};

/**
 * Extension CLI 通用参数。
 */
export type ExtensionCliBaseOptions = {
  /**
   * 项目根目录。
   */
  path?: string;
  /**
   * daemon host。
   */
  host?: string;
  /**
   * daemon port。
   */
  port?: number;
  /**
   * 是否 JSON 输出。
   */
  json?: boolean;
};
