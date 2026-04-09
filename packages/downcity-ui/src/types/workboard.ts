/**
 * Workboard 组件公开类型。
 *
 * 关键点（中文）
 * - 这些类型只服务 `@downcity/ui` 的 workboard 组件导出。
 * - UI 只接收对外安全的模糊公开态，不消费内部运行事实。
 */

/**
 * Workboard 活动类型。
 */
export type DowncityWorkboardActivityKind = "focus" | "progress" | "idle";

/**
 * Workboard 活动状态。
 */
export type DowncityWorkboardActivityStatus = "active" | "steady" | "waiting" | "issue";

/**
 * Workboard 信号语气。
 */
export type DowncityWorkboardSignalTone = "neutral" | "accent" | "warning";

/**
 * 单个公开活动项。
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
   * 对外标题。
   */
  title: string;
  /**
   * 对外摘要。
   */
  summary: string;
  /**
   * 当前状态。
   */
  status: DowncityWorkboardActivityStatus;
  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;
  /**
   * 对外安全标签。
   */
  tags: string[];
}

/**
 * 单个公开信号项。
 */
export interface DowncityWorkboardSignalItem {
  /**
   * 信号名称。
   */
  label: string;
  /**
   * 信号值。
   */
  value: string;
  /**
   * 信号语气。
   */
  tone: DowncityWorkboardSignalTone;
}

/**
 * workboard 顶部公开摘要。
 */
export interface DowncityWorkboardSummary {
  /**
   * 顶部 headline。
   */
  headline: string;
  /**
   * 当前姿态描述。
   */
  posture: string;
  /**
   * 当前动量描述。
   */
  momentum: string;
  /**
   * 可见性说明。
   */
  visibilityNote: string;
}

/**
 * agent 基础公开摘要。
 */
export interface DowncityWorkboardAgentSummary {
  /**
   * agent 展示名称。
   */
  name: string;
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
   * agent 公开摘要。
   */
  agent: DowncityWorkboardAgentSummary;
  /**
   * 顶部公开摘要。
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
   * 模糊信号列表。
   */
  signals: DowncityWorkboardSignalItem[];
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
