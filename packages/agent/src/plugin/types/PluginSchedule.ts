/**
 * PluginSchedule：plugin action 调度相关共享类型。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * 调度任务状态。
 */
export type ScheduledJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/**
 * 调度任务完整记录。
 */
export interface ScheduledJobRecord {
  /**
   * 调度任务唯一 ID。
   */
  id: string;
  /**
   * 目标 plugin 名称。
   */
  pluginName: string;
  /**
   * 目标 action 名称。
   */
  actionName: string;
  /**
   * 原始 action payload。
   */
  payload: JsonValue;
  /**
   * 计划执行时间（毫秒时间戳）。
   */
  runAtMs: number;
  /**
   * 当前调度状态。
   */
  status: ScheduledJobStatus;
  /**
   * 最近一次错误文本。
   */
  error?: string;
  /**
   * 创建时间（毫秒时间戳）。
   */
  createdAt: number;
  /**
   * 最近更新时间（毫秒时间戳）。
   */
  updatedAt: number;
}

/**
 * 创建调度任务所需输入。
 */
export interface CreateScheduledJobInput {
  /**
   * 目标 plugin 名称。
   */
  pluginName: string;
  /**
   * 目标 action 名称。
   */
  actionName: string;
  /**
   * 目标 action payload。
   */
  payload: JsonValue;
  /**
   * 计划执行时间（毫秒时间戳）。
   */
  runAtMs: number;
}

/**
 * 统一 plugin command 调度输入。
 */
export interface PluginCommandScheduleInput {
  /**
   * 计划执行时间（毫秒时间戳）。
   */
  runAtMs: number;
}
