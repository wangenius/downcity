/**
 * city agent chat TUI slash 命令分发器。
 */
/**
 * 分发并执行 slash 命令意图。
 *
 * @param host slash 命令宿主。
 * @param intent 解析后的意图。
 */
export async function dispatchSlashCommand(host, intent) {
    switch (intent.kind) {
        case "not-command":
        case "message":
            await host.send_normal_user_input(intent.input);
            return;
        case "invalid":
            host.show_error(`Invalid slash command: /${intent.command_name}`);
            return;
        case "blocked":
            host.show_error(`Cannot /${intent.command_name} while streaming.`);
            return;
        case "builtin":
            await handle_built_in_slash_command(host, intent.name, intent.args);
            return;
    }
}
/**
 * 处理内置 slash 命令。
 *
 * @param host slash 命令宿主。
 * @param name 命令名称。
 * @param args 命令参数。
 */
async function handle_built_in_slash_command(host, name, _args) {
    switch (name) {
        case "help":
            host.show_help();
            return;
        case "quit":
        case "exit":
            await host.stop();
            return;
        case "clear":
            host.clear_transcript();
            return;
        case "new":
            await host.create_new_session();
            return;
        case "session":
        case "sessions":
            await host.show_session_picker();
            return;
        default:
            host.show_error(`Unknown slash command: /${name}`);
    }
}
//# sourceMappingURL=dispatch.js.map