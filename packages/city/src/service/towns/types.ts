/**
 * Town 层公共类型。
 *
 * Town 是 City 多租户隔离的基本单位，每个 API 调用都绑定到一个 Town。
 */

/**
 * Town 当前状态。
 */
export type TownStatus = "active" | "paused";

/**
 * City 中的 Town 记录。
 */
export interface Town extends Record<string, unknown> {
  /**
   * Town 的唯一 ID。
   */
  town_id: string;

  /**
   * Town 展示名称。
   */
  name: string;

  /**
   * Town 当前状态。
   */
  status: TownStatus;

  /**
   * Town 创建时间。
   */
  created_at: string;

  /**
   * Town 最后更新时间。
   */
  updated_at: string;
}

/**
 * 创建 Town 时的输入。
 */
export interface TownCreateInput {
  /**
   * Town 展示名称。
   */
  name: string;

  /**
   * 自定义 Town ID。
   *
   * 未传入时由 City 自动生成 `town_${randomSecret(12)}` 格式的 ID。
   * 传入时直接采用该值，便于在种子场景中使用固定 ID。
   */
  town_id?: string;
}
