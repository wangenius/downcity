/**
 * City ProjectExecutionBinding 包级转发入口。
 *
 * 关键点（中文）
 * - 项目执行绑定解析统一走 `@downcity/agent`。
 * - city 不再维护独立的 execution 解析规则。
 */

export {
  readProjectExecutionBinding,
  readProjectPrimaryModelId,
  hasProjectExecutionTarget,
  assertProjectExecutionTarget,
} from "@downcity/agent";
