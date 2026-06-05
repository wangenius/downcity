#!/usr/bin/env node

/**
 * City CLI 进程入口。
 *
 * 关键点（中文）
 * - 入口文件只负责启动 CLI。
 * - commander 命令树统一由 `src/command/RootCommand.ts` 装配。
 */

import { runCityCli } from "./command/RootCommand.js";

await runCityCli();
