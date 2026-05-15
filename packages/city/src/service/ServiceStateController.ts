/**
 * City ServiceStateController 包级转发入口。
 *
 * 关键点（中文）
 * - service 状态、生命周期控制统一由 `@downcity/agent` 维护。
 * - city 不再维护独立 service 状态容器。
 */

export {
  controlServiceState,
  getServiceRootCommandNames,
  getStaticServices,
  isServiceRunning,
  listServiceStates,
  startAllServices,
  stopAllServices,
} from "@downcity/agent";
export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@downcity/agent";
