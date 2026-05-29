/**
 * Studio 层公共类型。
 *
 * Studio 是 City 多租户隔离的基本单位，每个 API 调用都绑定到一个 Studio。
 */

/**
 * Studio 当前状态。
 */
export type StudioStatus = "active" | "paused";

/**
 * City 中的 Studio 记录。
 */
export interface Studio extends Record<string, unknown> {
  /**
   * Studio 的唯一 ID。
   */
  studio_id: string;

  /**
   * Studio 展示名称。
   */
  name: string;

  /**
   * Studio 当前状态。
   */
  status: StudioStatus;

  /**
   * Studio 创建时间。
   */
  created_at: string;

  /**
   * Studio 最后更新时间。
   */
  updated_at: string;
}

/**
 * 创建 Studio 时的输入。
 */
export interface StudioCreateInput {
  /**
   * Studio 展示名称。
   */
  name: string;

  /**
   * 自定义 Studio ID。
   *
   * 未传入时由 City 自动生成 `studio_${randomSecret(12)}` 格式的 ID。
   * 传入时直接采用该值，便于在种子场景中使用固定 ID。
   */
  studio_id?: string;
}
