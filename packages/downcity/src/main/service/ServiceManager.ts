/**
 * ServiceManager 类型门面。
 *
 * 关键点（中文）
 * - service 共享契约已经提升到 `src/types/Service.ts`。
 * - 这里保留旧入口，仅做 re-export，避免 main/service 内部路径继续持有类型定义。
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
  ServiceRuntimeState,
} from "@/types/Service.js";
