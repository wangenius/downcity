/**
 * City Service Manager 包级转发入口。
 *
 * 关键点（中文）
 * - service 管理门面统一由 `@downcity/agent` 提供。
 * - city 保留文件入口只为内部旧路径编译通过。
 */

export {
  controlServiceState,
  getServiceRootCommandNames,
  getStaticServices,
  isServiceRunning,
  listServiceStates,
  registerAllServicesForServer,
  runServiceCommand,
  startAllServices,
  stopAllServices,
} from "@downcity/agent";
export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@downcity/agent";
