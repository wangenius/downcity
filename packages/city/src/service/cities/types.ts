/**
 * City 公共类型模块。
 *
 * City 是 Agent 的生活环境，每个 API 调用都绑定到一个 City。
 */

/**
 * City 当前状态。
 */
export type CityStatus = "active" | "paused";

/**
 * City 记录。
 */
export interface CityRecord extends Record<string, unknown> {
  /**
   * City 的唯一 ID。
   */
  city_id: string;

  /**
   * City 展示名称。
   */
  name: string;

  /**
   * City 当前状态。
   */
  status: CityStatus;

  /**
   * City 创建时间。
   */
  created_at: string;

  /**
   * City 最后更新时间。
   */
  updated_at: string;
}

/**
 * 创建 City 时的输入。
 */
export interface CityCreateInput {
  /**
   * City 展示名称。
   */
  name: string;

  /**
   * 自定义 City ID。
   *
   * 未传入时由 Federation 自动生成 `city_${randomSecret(12)}` 格式的 ID。
   * 传入时直接采用该值，便于在种子场景中使用固定 ID。
   */
  city_id?: string;
}
