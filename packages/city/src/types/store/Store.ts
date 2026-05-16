/**
 * city ConsoleStore 相关类型。
 *
 * 关键点（中文）
 * - 绝大多数存储结构直接复用 `@downcity/agent` 的共享类型定义。
 * - city 只在这里补充 console 专属的派生视图类型，避免继续维护整份副本。
 */

export * from "@downcity/agent/shared/types/Store.js";

/**
 * Provider 元信息（不含 API Key，用于同步快速查询）。
 */
export interface StoredProviderMeta {
  /**
   * provider 主键 ID。
   */
  id: string;
  /**
   * provider 类型。
   */
  type: string;
  /**
   * provider baseUrl（可选）。
   */
  baseUrl?: string;
}
