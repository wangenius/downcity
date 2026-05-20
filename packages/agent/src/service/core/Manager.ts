/**
 * Service Manager 门面模块。
 *
 * 关键点（中文）
 * - `service/core/*` 是 service 的管理层，不是具体 service 实现层。
 * - 对外继续保持 `service/core/Manager.ts` 这个稳定门面，统一暴露常用管理能力。
 * - 具体实现位于 `service/builtins/*`，这里负责注册、生命周期控制、命令转发与远程接口装配。
 */

export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@/service/types/ServiceState.js";
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
