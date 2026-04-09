/**
 * Workboard 组件公开类型。
 *
 * 关键点（中文）
 * - 这里导出的是“全局 workboard”板面类型，而不是单个 agent 面板。
 * - UI 组件只消费聚合后的公开状态，不知道 plugin 内部实现。
 */

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
  kind: "focus" | "progress" | "idle";
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
  status: "active" | "steady" | "waiting" | "issue";
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
 * 单个公开线索项。
 */
export interface DowncityWorkboardSignalItem {
  /**
   * 线索名称。
   */
  label: string;
  /**
   * 线索值。
   */
  value: string;
  /**
   * 线索语气。
   */
  tone: "neutral" | "accent" | "warning";
}

/**
 * 单个 agent 的公开快照。
 */
export interface DowncityWorkboardAgentSnapshot {
  /**
   * agent 展示名称。
   */
  name: string;
  /**
   * 是否运行中。
   */
  running: boolean;
  /**
   * 对外状态文案。
   */
  statusText: string;
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string;
  /**
   * headline。
   */
  headline: string;
  /**
   * posture。
   */
  posture: string;
  /**
   * momentum。
   */
  momentum: string;
  /**
   * 可见性说明。
   */
  visibilityNote: string;
  /**
   * 当前公开活动列表。
   */
  current: DowncityWorkboardActivityItem[];
  /**
   * 最近公开活动列表。
   */
  recent: DowncityWorkboardActivityItem[];
  /**
   * 公开线索列表。
   */
  signals: DowncityWorkboardSignalItem[];
}

/**
 * 全局看板中的单个 agent 项。
 */
export interface DowncityWorkboardAgentItem {
  /**
   * agent 稳定标识。
   */
  id: string;
  /**
   * agent 展示名称。
   */
  name: string;
  /**
   * 当前是否运行中。
   */
  running: boolean;
  /**
   * headline。
   */
  headline: string;
  /**
   * posture。
   */
  posture: string;
  /**
   * momentum。
   */
  momentum: string;
  /**
   * 状态摘要文案。
   */
  statusText: string;
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string;
  /**
   * 当前公开活动数量。
   */
  currentCount: number;
  /**
   * 近期片段数量。
   */
  recentCount: number;
  /**
   * 公开线索数量。
   */
  signalCount: number;
  /**
   * 该 agent 的完整公开快照。
   */
  snapshot: DowncityWorkboardAgentSnapshot;
}

/**
 * 全局看板顶部摘要。
 */
export interface DowncityWorkboardBoardSummary {
  /**
   * agent 总数。
   */
  totalAgents: number;
  /**
   * live agent 数量。
   */
  liveAgents: number;
  /**
   * 呈现活跃状态的 agent 数量。
   */
  activeAgents: number;
  /**
   * 安静中的 agent 数量。
   */
  quietAgents: number;
}

/**
 * 全局 workboard 板面。
 */
export interface DowncityWorkboardBoardSnapshot {
  /**
   * 顶部摘要。
   */
  summary: DowncityWorkboardBoardSummary;
  /**
   * agent 列表。
   */
  agents: DowncityWorkboardAgentItem[];
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string;
}

/**
 * Workboard 组件属性。
 */
export interface DowncityWorkboardProps {
  /**
   * 当前板面。
   */
  board: DowncityWorkboardBoardSnapshot | null;
  /**
   * 当前是否处于刷新中。
   */
  loading?: boolean;
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * 外层接收选中变化。
   */
  onSelectAgent?: (agentId: string) => void;
  /**
   * 外层触发刷新。
   */
  onRefresh?: () => void;
  /**
   * 自定义类名。
   */
  className?: string;
}
