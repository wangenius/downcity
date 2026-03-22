/**
 * 兼容层：保留旧路径导出。
 *
 * 关键点（中文）
 * - 新代码应改用 `@utils/Id`。
 * - 这里仅保留转发，避免老引用立即报错。
 */

export { generateId } from "@utils/Id.js";
