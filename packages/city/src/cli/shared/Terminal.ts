/**
 * City terminal 命令装配模块。
 *
 * 关键点（中文）
 * - `city terminal` 承接原独立 manager 的交互式管理入口。
 * - 这里仅负责把 terminal 挂到 city CLI 命令树，具体状态机仍在 terminal 模块内部。
 */

import type { Command } from "commander";
import { runTerminalApp } from "@/terminal/app.js";
import { createVersionBanner } from "./IndexSupport.js";

/**
 * 注册 `city terminal` 命令。
 */
export function registerTerminalCommand(program: Command, version: string): void {
  program
    .command("terminal [action]")
    .description("打开 Downcity 服务终端（管理 infra/services server 与用户会话）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(version, async (action?: string) => {
      await runTerminalApp(action ? [action] : []);
    }));
}
