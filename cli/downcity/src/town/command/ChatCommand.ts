/**
 * `town chat` 命令组入口。
 *
 * 关键点（中文）
 * - 这里先注册裸 `town chat` 的交互式入口。
 * - 具体 chat 会话操作命令由 plugin action 注册器补充到同一个命令组。
 * - Town 不在这里注册 chat platform 运行态控制命令。
 */

import type { Command } from "commander";
import { registerChatAuthCommands } from "./ChatAuthCommand.js";
import { runInteractiveChatManager } from "../shared/ChatManager.js";
import { helpText, t } from "../../shared/CliLocale.js";

/**
 * 注册 `town chat` 交互式入口。
 */
export function registerChatCommand(program: Command): void {
  const chat = program
    .command("chat")
    .description(t({
      zh: "管理 chat plugin 共享资源与会话操作（无参数时启动交互式管理器）",
      en: "manage chat plugin shared resources and conversation operations (opens the interactive manager when used without arguments)",
    }))
    .helpOption("--help", helpText())
    .action(async () => {
      if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
        await runInteractiveChatManager();
        return;
      }
      chat.outputHelp();
    });

  registerChatAuthCommands(chat);
}
