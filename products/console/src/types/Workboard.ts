/**
 * Console workboard 类型定义。
 *
 * 关键点（中文）
 * - console 只消费 workboard 的对外模糊状态，不直接接触内部运行事实。
 * - 字段命名与 plugin 公开快照保持一致，避免出现二次扩展泄漏。
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
 * 顶部公开摘要。
 */
export interface UiWorkboardSummary {
  /**
   * 顶部 headline。
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
}

/**
 * agent 公开摘要。
 */
export interface UiWorkboardAgentSummary {
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
   * 最近采样时间（ISO8601）。
   */
  collectedAt: string
}

/**
 * workboard 快照。
 */
export interface UiWorkboardSnapshot {
  /**
   * agent 公开摘要。
   */
  agent: UiWorkboardAgentSummary
  /**
   * 顶部公开摘要。
   */
  summary: UiWorkboardSummary
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
 * workboard 快照响应。
 */
export interface UiWorkboardSnapshotResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean
  /**
   * 当前快照。
   */
  snapshot?: UiWorkboardSnapshot
  /**
   * 错误信息。
   */
  error?: string
}
