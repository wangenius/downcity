/**
 * City 模型工厂包级转发入口。
 *
 * 关键点（中文）
 * - 模型创建逻辑统一由 `@downcity/agent` 提供。
 * - city 不再维护单独的 provider/model 解析实现。
 */

export { createModel } from "@downcity/agent";
