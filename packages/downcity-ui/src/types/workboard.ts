/**
 * Workboard 组件公开类型。
 *
 * 关键点（中文）
 * - 这些类型只服务 `@downcity/ui` 的 workboard 组件导出。
 * - 字段命名尽量贴近展示语义，避免把 runtime 内部结构直接暴露到 UI SDK。
 */

/**
 * Workboard 活动类型。
 */
export type DowncityWorkboardActivityKind = "session" | "task" | "system";

/**
 * Workboard 活动状态。
 */
export type DowncityWorkboardActivityStatus = "running" | "idle" | "done" | "error";

/**
 * 单个工作活动项。
 */
export interface DowncityWorkboardActivityItem {
  /**
   * 活动稳定标识。
   */
  id: string;
  /**
   * 活动类型。
   */
  kind: DowncityWorkboardActivityKind;
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
  status: DowncityWorkboardActivityStatus;
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
export interface DowncityWorkboardServiceItem {
  /**
   * service 名称。
   */
  name: string;
  /**
   * 当前状态文本。
   */
  state: string;
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
 * workboard 顶部聚合摘要。
 */
export interface DowncityWorkboardSummary {
  /**
   * 当前执行中的会话数量。
   */
  executingSessions: number;
  /**
   * 最近活动条目数量。
   */
  recentActivities: number;
  /**
   * 当前异常 service 数量。
   */
  degradedServices: number;
}

/**
 * task 摘要信息。
 */
export interface DowncityWorkboardTaskSummary {
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
 * agent 基础摘要。
 */
export interface DowncityWorkboardAgentSummary {
  /**
   * agent 唯一标识。
   */
  id: string;
  /**
   * agent 展示名称。
   */
  name: string;
  /**
   * agent 项目根路径。
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
   * agent 是否运行中。
   */
  running: boolean;
  /**
   * 顶部状态文案。
   */
  statusText: string;
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string;
}

/**
 * Workboard 快照。
 */
export interface DowncityWorkboardSnapshot {
  /**
   * agent 摘要信息。
   */
  agent: DowncityWorkboardAgentSummary;
  /**
   * 顶部聚合摘要。
   */
  summary: DowncityWorkboardSummary;
  /**
   * 当前活动列表。
   */
  current: DowncityWorkboardActivityItem[];
  /**
   * 最近活动列表。
   */
  recent: DowncityWorkboardActivityItem[];
  /**
   * service 状态列表。
   */
  services: DowncityWorkboardServiceItem[];
  /**
   * task 摘要。
   */
  tasks: DowncityWorkboardTaskSummary;
}

/**
 * Workboard 组件属性。
 */
export interface DowncityWorkboardProps {
  /**
   * 当前快照。
   */
  snapshot: DowncityWorkboardSnapshot | null;
  /**
   * 当前是否处于刷新中。
   */
  loading?: boolean;
  /**
   * 当前选中的活动 id。
   */
  selectedActivityId?: string;
  /**
   * 外层接收选中变化。
   */
  onSelectActivity?: (activityId: string) => void;
  /**
   * 外层触发刷新。
   */
  onRefresh?: () => void;
  /**
   * 自定义类名。
   */
  className?: string;
}
