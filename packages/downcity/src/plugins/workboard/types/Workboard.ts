/**
 * Workboard 插件类型定义。
 *
 * 关键点（中文）
 * - 这些类型只服务 workboard plugin 自身，不进入 shared。
 * - 输出结构优先面向 console workboard 展示，而不是通用领域模型。
 */

import type { ServiceState } from "@/shared/types/Service.js";

/**
 * Workboard 活动类型。
 */
export type WorkboardActivityKind = "session" | "task" | "system";

/**
 * Workboard 活动状态。
 */
export type WorkboardActivityStatus = "running" | "idle" | "done" | "error";

/**
 * 单个工作活动项。
 */
export interface WorkboardActivityItem {
  /**
   * 活动稳定标识。
   */
  id: string;
  /**
   * 活动类型。
   */
  kind: WorkboardActivityKind;
  /**
   * 主标题。
   */
  title: string;
  /**
   * 摘要说明。
   */
  summary: string;
  /**
   * 当前状态。
   */
  status: WorkboardActivityStatus;
  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;
  /**
   * 开始时间（ISO8601，可选）。
   */
  startedAt?: string;
  /**
   * 关联 sessionId（可选）。
   */
  sessionId?: string;
  /**
   * 次级标签集合。
   */
  tags: string[];
}

/**
 * 单个 service 状态摘要。
 */
export interface WorkboardServiceItem {
  /**
   * service 名称。
   */
  name: string;
  /**
   * 当前运行状态。
   */
  state: ServiceState;
  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;
  /**
   * 最近错误信息（可选）。
   */
  lastError?: string;
}

/**
 * task 聚合摘要。
 */
export interface WorkboardTaskSummary {
  /**
   * task 总数。
   */
  total: number;
  /**
   * 启用中的 task 数量。
   */
  enabled: number;
  /**
   * 暂停中的 task 数量。
   */
  paused: number;
  /**
   * 禁用中的 task 数量。
   */
  disabled: number;
}

/**
 * workboard 顶部摘要。
 */
export interface WorkboardSummary {
  /**
   * 当前执行中的 session 数量。
   */
  executingSessions: number;
  /**
   * 最近活动条目数量。
   */
  recentActivities: number;
  /**
   * 异常 service 数量。
   */
  degradedServices: number;
}

/**
 * agent 摘要信息。
 */
export interface WorkboardAgentSummary {
  /**
   * agent 唯一标识。
   */
  id: string;
  /**
   * agent 展示名称。
   */
  name: string;
  /**
   * agent 项目根目录。
   */
  projectRoot: string;
  /**
   * 当前执行模式。
   */
  executionMode: string;
  /**
   * 当前主模型标识（可选）。
   */
  modelId?: string;
  /**
   * 当前 agent 是否运行中。
   */
  running: boolean;
  /**
   * 顶部状态文案。
   */
  statusText: string;
  /**
   * 最近采集时间（ISO8601）。
   */
  collectedAt: string;
}

/**
 * Workboard 快照。
 */
export interface WorkboardSnapshot {
  /**
   * agent 基础摘要。
   */
  agent: WorkboardAgentSummary;
  /**
   * 顶部聚合摘要。
   */
  summary: WorkboardSummary;
  /**
   * 当前活动列表。
   */
  current: WorkboardActivityItem[];
  /**
   * 最近活动列表。
   */
  recent: WorkboardActivityItem[];
  /**
   * service 状态列表。
   */
  services: WorkboardServiceItem[];
  /**
   * task 聚合摘要。
   */
  tasks: WorkboardTaskSummary;
}

/**
 * Workboard 快照响应。
 */
export interface WorkboardSnapshotResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;
  /**
   * 当前快照。
   */
  snapshot: WorkboardSnapshot;
}
