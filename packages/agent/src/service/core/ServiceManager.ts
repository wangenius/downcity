/**
 * ServiceManager 类型门面。
 *
 * 关键点（中文）
 * - service 共享契约位于 `service/types/Service.ts`。
 * - 这里保留旧入口，仅做 re-export，避免 service/core 内部路径继续持有类型定义。
 */

export type {
  Service,
  ServiceAction,
  ServiceActionApi,
  ServiceActionCommand,
  ServiceActionCommandInput,
  ServiceActionResult,
  ServiceActions,
  ServiceCommandResult,
  ServiceLifecycle,
  ServiceState,
} from "@/service/types/Service.js";
