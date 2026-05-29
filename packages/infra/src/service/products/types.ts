/**
 * Product 层公共类型。
 *
 * Product 是 InfraRuntime 多租户隔离的基本单位，每个 API 调用都绑定到一个 Product。
 */

/**
 * Product 当前状态。
 */
export type ProductStatus = "active" | "paused";

/**
 * InfraRuntime 中的 Product 记录。
 */
export interface Product extends Record<string, unknown> {
  /**
   * Product 的唯一 ID。
   */
  product_id: string;

  /**
   * Product 展示名称。
   */
  name: string;

  /**
   * Product 当前状态。
   */
  status: ProductStatus;

  /**
   * Product 创建时间。
   */
  created_at: string;

  /**
   * Product 最后更新时间。
   */
  updated_at: string;
}

/**
 * 创建 Product 时的输入。
 */
export interface ProductCreateInput {
  /**
   * Product 展示名称。
   */
  name: string;

  /**
   * 自定义 Product ID。
   *
   * 未传入时由 InfraRuntime 自动生成 `prod_${randomSecret(12)}` 格式的 ID。
   * 传入时直接采用该值，便于在种子场景中使用固定 ID。
   */
  product_id?: string;
}
