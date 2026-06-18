#!/usr/bin/env node
/**
 * Downcity CLI 统一入口。
 *
 * 关键点（中文）
 * - 入口文件只负责启动 CLI，commander 命令树由 `src/command/RootCommand.ts` 装配。
 * - `-v/--version` 走轻量快速路径，避免版本命令被完整 CLI 依赖链阻塞。
 * - 统一命令结构：`city base` — City 管理，`city town` — Town/Agent 管理。
 */
export {};
//# sourceMappingURL=index.d.ts.map