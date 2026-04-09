/**
 * Console workboard 类型定义。
 *
 * 关键点（中文）
 * - workboard 是独立 feature，类型不并入 Dashboard.ts。
 * - 字段设计直接对齐 console 实际消费的快照结构。
 */

/**
 * 单个活动项。
 */
export interface UiWorkboardActivityItem {
  /**
   * 活动稳定标识。
   */
  id: string;
  /**
   * 活动类型。
   */
  kind: "session" | "task" | "system";
  /**
   * 活动标题。
   */
  title: string;
  /**
   * 活动摘要。
   */
  summary: string;
  /**
   * 活动状态。
   */
  status: "running" | "idle" | "done" | "error";
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
   * 标签列表。
   */
  tags: string[];
}

/**
 * 单个 service 状态项。
 */
export interface UiWorkboardServiceItem {
  /**
   * service 名称。
   */
  name: string;
  /**
   * 当前状态。
   */
  state: string;
  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;
  /**
   * 最近错误（可选）。
   */
  lastError?: string;
}

/**
 * 顶部摘要。
 */
export interface UiWorkboardSummary {
  /**
   * 当前执行中的 session 数量。
   */
  executingSessions: number;
  /**
   * 最近活动数量。
   */
  recentActivities: number;
  /**
   * 异常 service 数量。
   */
  degradedServices: number;
}

/**
 * task 摘要。
 */
export interface UiWorkboardTaskSummary {
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
 * agent 摘要信息。
 */
export interface UiWorkboardAgentSummary {
  /**
   * agent 唯一标识。
   */
  id: string;
  /**
   * agent 展示名。
   */
  name: string;
  /**
   * 项目根目录。
   */
  projectRoot: string;
  /**
   * 执行模式。
   */
  executionMode: string;
  /**
   * 主模型标识（可选）。
   */
  modelId?: string;
  /**
   * 当前 agent 是否运行中。
   */
  running: boolean;
  /**
   * 状态摘要文案。
   */
  statusText: string;
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string;
}

/**
 * workboard 快照。
 */
export interface UiWorkboardSnapshot {
  /**
   * agent 摘要。
   */
  agent: UiWorkboardAgentSummary;
  /**
   * 顶部摘要。
   */
  summary: UiWorkboardSummary;
  /**
   * 当前活动列表。
   */
  current: UiWorkboardActivityItem[];
  /**
   * 最近活动列表。
   */
  recent: UiWorkboardActivityItem[];
  /**
   * service 状态列表。
   */
  services: UiWorkboardServiceItem[];
  /**
   * task 摘要。
   */
  tasks: UiWorkboardTaskSummary;
}

/**
 * workboard 快照响应。
 */
export interface UiWorkboardSnapshotResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前快照。
   */
  snapshot?: UiWorkboardSnapshot;
  /**
   * 错误信息。
   */
  error?: string;
}
