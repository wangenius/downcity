/**
 * Sandbox runtime 类型兼容出口。
 *
 * 关键点（中文）：sandbox runtime 类型已迁移到 `@downcity/shell`。
 */

export type {
  ResolvedSandboxConfig,
  SandboxBackend,
  SandboxSessionSnapshot,
  SandboxSessionStatus,
  SandboxSpawnParams,
  SandboxSpawnResult,
} from "@downcity/shell/sandbox/types/SandboxRuntime.js";
