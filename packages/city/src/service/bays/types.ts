/**
 * Bay 层公共类型。
 *
 * Bay 是 City 多租户隔离的基本单位，每个 API 调用都绑定到一个 Bay。
 */

/**
 * Bay 当前状态。
 */
export type BayStatus = "active" | "paused";

/**
 * City 中的 Bay 记录。
 */
export interface Bay extends Record<string, unknown> {
  /**
   * Bay 的唯一 ID。
   */
  bay_id: string;

  /**
   * Bay 展示名称。
   */
  name: string;

  /**
   * Bay 当前状态。
   */
  status: BayStatus;

  /**
   * Bay 创建时间。
   */
  created_at: string;

  /**
   * Bay 最后更新时间。
   */
  updated_at: string;
}

/**
 * 创建 Bay 时的输入。
 */
export interface BayCreateInput {
  /**
   * Bay 展示名称。
   */
  name: string;

  /**
   * 自定义 Bay ID。
   *
   * 未传入时由 City 自动生成 `bay_${randomSecret(12)}` 格式的 ID。
   * 传入时直接采用该值，便于在种子场景中使用固定 ID。
   */
  bay_id?: string;
}
