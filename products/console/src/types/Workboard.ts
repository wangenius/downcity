/**
 * Console workboard 类型定义。
 *
 * 关键点（中文）
 * - workboard 是 Console 全局看板，聚合所有 agent 的公开状态。
 * - plugin 仍然只暴露单个 agent 快照；这里定义的是 console 聚合后的板面模型。
 */

/**
 * 单个公开活动项。
 */
export interface UiWorkboardActivityItem {
  /**
   * 活动稳定标识。
   */
  id: string
  /**
   * 活动类型。
   */
  kind: "focus" | "progress" | "idle"
  /**
   * 对外标题。
   */
  title: string
  /**
   * 对外摘要。
   */
  summary: string
  /**
   * 当前状态。
   */
  status: "active" | "steady" | "waiting" | "issue"
  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string
  /**
   * 对外安全标签。
   */
  tags: string[]
}

/**
 * 单个公开信号项。
 */
export interface UiWorkboardSignalItem {
  /**
   * 信号名称。
   */
  label: string
  /**
   * 信号值。
   */
  value: string
  /**
   * 信号语气。
   */
  tone: "neutral" | "accent" | "warning"
}

/**
 * 单个 agent 的公开快照。
 */
export interface UiWorkboardAgentSnapshot {
  /**
   * agent 展示名称。
   */
  name: string
  /**
   * agent 是否运行中。
   */
  running: boolean
  /**
   * 顶部状态文案。
   */
  statusText: string
  /**
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string
  /**
   * 对外 headline。
   */
  headline: string
  /**
   * 当前姿态描述。
   */
  posture: string
  /**
   * 当前动量描述。
   */
  momentum: string
  /**
   * 可见性说明。
   */
  visibilityNote: string
  /**
   * 当前活动列表。
   */
  current: UiWorkboardActivityItem[]
  /**
   * 最近活动列表。
   */
  recent: UiWorkboardActivityItem[]
  /**
   * 模糊信号列表。
   */
  signals: UiWorkboardSignalItem[]
}

/**
 * 全局看板中的单个 agent 卡片。
 */
export interface UiWorkboardAgentBoardItem {
  /**
   * agent 稳定标识。
   */
  id: string
  /**
   * agent 展示名称。
   */
  name: string
  /**
   * 当前是否运行中。
   */
  running: boolean
  /**
   * 顶部 headline。
   */
  headline: string
  /**
   * 当前姿态。
   */
  posture: string
  /**
   * 当前动量。
   */
  momentum: string
  /**
   * 当前状态文案。
   */
  statusText: string
  /**
   * 最近更新时间（ISO8601）。
   */
  collectedAt: string
  /**
   * 当前公开活动数。
   */
  currentCount: number
  /**
   * 近期片段数。
   */
  recentCount: number
  /**
   * 公开线索数。
   */
  signalCount: number
  /**
   * 完整公开快照。
   */
  snapshot: UiWorkboardAgentSnapshot
}

/**
 * 全局看板顶部摘要。
 */
export interface UiWorkboardBoardSummary {
  /**
   * agent 总数。
   */
  totalAgents: number
  /**
   * 运行中的 agent 数量。
   */
  liveAgents: number
  /**
   * 呈现活跃状态的 agent 数量。
   */
  activeAgents: number
  /**
   * 处于安静状态的 agent 数量。
   */
  quietAgents: number
}

/**
 * Console 全局 workboard 数据。
 */
export interface UiWorkboardBoardSnapshot {
  /**
   * 顶部摘要。
   */
  summary: UiWorkboardBoardSummary
  /**
   * agent 卡片列表。
   */
  agents: UiWorkboardAgentBoardItem[]
  /**
   * 最近一次板面采样时间（ISO8601）。
   */
  collectedAt: string
}

/**
 * plugin 单 agent 快照响应。
 */
export interface UiWorkboardSnapshotResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean
  /**
   * 当前快照。
   */
  snapshot?: {
    /**
     * agent 公开摘要。
     */
    agent: {
      /**
       * agent 展示名称。
       */
      name: string
      /**
       * 当前是否运行中。
       */
      running: boolean
      /**
       * 顶部状态文案。
       */
      statusText: string
      /**
       * 最近采样时间。
       */
      collectedAt: string
    }
    /**
     * 顶部公开摘要。
     */
    summary: {
      /**
       * headline。
       */
      headline: string
      /**
       * posture。
       */
      posture: string
      /**
       * momentum。
       */
      momentum: string
      /**
       * 可见性说明。
       */
      visibilityNote: string
    }
    /**
     * 当前活动列表。
     */
    current: UiWorkboardActivityItem[]
    /**
     * 最近活动列表。
     */
    recent: UiWorkboardActivityItem[]
    /**
     * 模糊信号列表。
     */
    signals: UiWorkboardSignalItem[]
  }
  /**
   * 错误信息。
   */
  error?: string
}
