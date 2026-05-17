/**
 * Service Manager 门面模块。
 *
 * 关键点（中文）
 * - `main/service/*` 是 service 的管理层，不是具体 service 实现层。
 * - 对外继续保持 `main/service/Manager.ts` 这个稳定入口，统一暴露常用管理能力。
 * - 具体实现位于 `src/services/*`，这里负责注册、生命周期控制、命令转发与远程接口装配。
 */

export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@/shared/types/ServiceState.js";
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
