/**
 * City ProjectSetup 包级转发入口。
 *
 * 关键点（中文）
 * - runtime 启动前准备逻辑统一走 `@downcity/agent`。
 * - city 不再维护独立的项目预检实现。
 */

export {
  ensureRuntimeProjectReady,
  ensureRuntimeExecutionBindingReady,
} from "@downcity/agent";
