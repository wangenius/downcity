/**
 * Sandbox 兼容出口。
 *
 * 关键点（中文）
 * - sandbox backend 已迁移到 `@downcity/shell`。
 * - 当前文件保留 agent internal 旧路径，作为迁移期适配层。
 */

export * from "@downcity/shell/sandbox/SandboxConfigResolver.js";
