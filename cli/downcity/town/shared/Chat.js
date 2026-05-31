/**
 * `town chat` 命令组入口。
 *
 * 关键点（中文）
 * - 这里先注册裸 `town chat` 的交互式入口。
 * - 具体 plugin runtime actions/lifecycle 命令仍由 plugin runtime 注册器补充到同一个命令组。
 */
import { registerChatAuthCommands } from "./ChatAuth.js";
import { runInteractiveChatManager } from "./ChatManager.js";
/**
 * 注册 `town chat` 交互式入口。
 */
export function registerChatCommand(program) {
    const chat = program
        .command("chat")
        .description("管理 chat plugin（无参数时启动交互式管理器）")
        .helpOption("--help", "display help for command")
        .action(async () => {
        if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
            await runInteractiveChatManager();
            return;
        }
        chat.outputHelp();
    });
    registerChatAuthCommands(chat);
}
//# sourceMappingURL=Chat.js.map