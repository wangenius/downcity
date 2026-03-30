/**
 * Service Manager 门面模块。
 *
 * 关键点（中文）
 * - 对外继续保持 `main/service/Manager.ts` 这个稳定入口。
 * - 内部实现已经拆为 state control / action runner / action api route 三层。
 * - 后续如果继续瘦身，只需要调整子模块，不影响上层调用点。
 */

export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@/types/ServiceState.js";
export {
  controlServiceState,
  getServiceRootCommandNames,
  getStaticServices,
  isServiceRunning,
  listServiceStates,
  startAllServices,
  stopAllServices,
} from "./ServiceStateController.js";
export { runServiceCommand } from "./ServiceActionRunner.js";
export { registerAllServicesForServer } from "./ServiceActionApi.js";
