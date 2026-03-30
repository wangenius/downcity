/**
 * ServiceState：service 状态相关共享类型。
 *
 * 关键点（中文）
 * - 这里只放状态快照与控制结果，不放 service 契约本身。
 * - 目的是让 main/service 内部拆分后，仍能共享统一的状态结构。
 */

import type { ServiceState } from "@/types/Service.js";

/**
 * 单个 service 状态的对外快照。
 */
export type ServiceStateSnapshot = {
  /**
   * service 名称。
   */
  name: string;
  /**
   * 当前运行状态。
   */
  state: ServiceState;
  /**
   * 最近一次状态更新时间（毫秒时间戳）。
   */
  updatedAt: number;
  /**
   * 最近一次错误信息。
   */
  lastError?: string;
  /**
   * 最近一次执行的命令名。
   */
  lastCommand?: string;
  /**
   * 最近一次执行命令的时间（毫秒时间戳）。
   */
  lastCommandAt?: number;
  /**
   * 是否支持 start/stop 生命周期控制。
   */
  supportsLifecycle: boolean;
  /**
   * 是否支持 command/action 命令调用。
   */
  supportsCommand: boolean;
};

/**
 * service 状态控制动作。
 */
export type ServiceStateControlAction =
  | "start"
  | "stop"
  | "restart"
  | "status";

/**
 * service 状态控制结果。
 */
export type ServiceStateControlResult = {
  /**
   * 控制动作是否成功。
   */
  success: boolean;
  /**
   * 成功或失败后返回的最新 service 快照。
   */
  service?: ServiceStateSnapshot;
  /**
   * 失败时的错误信息。
   */
  error?: string;
};
