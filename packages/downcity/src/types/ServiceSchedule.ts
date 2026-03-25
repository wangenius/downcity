/**
 * Service Schedule 类型定义。
 *
 * 关键点（中文）
 * - 统一描述“延迟/定时执行 service action”的持久化记录结构。
 * - 该模块只承载调度层状态，不耦合具体 service 的业务语义。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * 调度任务状态。
 *
 * 说明（中文）
 * - `pending`：等待到点执行。
 * - `running`：已被调度器领取，当前正在执行。
 * - `succeeded`：执行成功。
 * - `failed`：执行失败。
 * - `cancelled`：已取消，不再执行。
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
   *
   * 说明（中文）
   * - 由 runtime 创建并稳定持久化。
   * - 用于取消、查询、状态更新与恢复。
   */
  id: string;

  /**
   * 目标 service 名称。
   *
   * 说明（中文）
   * - 对应 `city <service> <action>` 中的 `<service>`。
   */
  serviceName: string;

  /**
   * 目标 action 名称。
   *
   * 说明（中文）
   * - 对应 `city <service> <action>` 中的 `<action>`。
   */
  actionName: string;

  /**
   * 原始 action payload。
   *
   * 说明（中文）
   * - 直接保存 service action 的 JSON payload。
   * - 调度器到点后会原样回放给 `runServiceCommand(...)`。
   */
  payload: JsonValue;

  /**
   * 计划执行时间（毫秒时间戳）。
   *
   * 说明（中文）
   * - 统一归一化为 Unix epoch ms。
   */
  runAtMs: number;

  /**
   * 当前调度状态。
   */
  status: ScheduledJobStatus;

  /**
   * 最近一次错误文本。
   *
   * 说明（中文）
   * - 仅在失败场景下写入。
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
   * 目标 service 名称。
   */
  serviceName: string;

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
 * 统一 service command 调度输入。
 */
export interface ServiceCommandScheduleInput {
  /**
   * 计划执行时间（毫秒时间戳）。
   *
   * 说明（中文）
   * - command 层统一只接收归一化后的绝对时间。
   */
  runAtMs: number;
}
