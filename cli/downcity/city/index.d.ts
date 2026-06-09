#!/usr/bin/env node
/**
 * City CLI 进程入口。
 *
 * 关键点（中文）
 * - 入口文件只负责启动 CLI。
 * - commander 命令树统一由 `src/command/RootCommand.ts` 装配。
 * - `-v/--version` 走轻量快速路径，避免版本命令被完整 CLI 依赖链阻塞。
 */
export {};
//# sourceMappingURL=index.d.ts.map