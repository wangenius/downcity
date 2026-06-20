/**
 * `city token` 命令树。
 *
 * 关键点（中文）
 * - token 管理只允许在本机 CLI 执行，不再暴露用户名密码登录流。
 * - 根命令支持交互式入口，减少用户记忆负担。
 * - 子命令依旧保留脚本友好的非交互模式，便于自动化调用。
 */
import { AuthService } from "../../city/runtime/auth/AuthService.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { helpText, t } from "../../shared/CliLocale.js";
import { createToken, deleteToken } from "./token/TokenActions.js";
import { promptTokenIdForDelete, runInteractiveCreateCommandFlow, runInteractiveTokenCommand, } from "./token/TokenPrompts.js";
import { printTokenList } from "./token/TokenRender.js";
/**
 * 注册 `city token` 命令。
 */
export function registerTokenCommand(program) {
    const token = program
        .command("token")
        .description(t({
        zh: "管理本机 Bearer Token（无参数时启动交互式管理器）",
        en: "manage local Bearer tokens (opens the interactive manager when used without arguments)",
    }))
        .helpOption("--help", helpText())
        .action(async () => {
        await runInteractiveTokenCommand();
    });
    token
        .command("list")
        .description(t({
        zh: "列出本机 Bearer Token",
        en: "list local Bearer tokens",
    }))
        .option("--json", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }))
        .helpOption("--help", helpText())
        .action((options) => {
        const authService = new AuthService();
        try {
            const tokens = authService.listLocalCliTokens();
            printTokenList(tokens, options.json === true);
        }
        finally {
            authService.close();
        }
    });
    token
        .command("create")
        .description(t({
        zh: "签发新的本机 Bearer Token",
        en: "issue a new local Bearer token",
    }))
        .argument("[name]", t({
        zh: "token 名称",
        en: "token name",
    }))
        .option("--expires-at <iso>", t({
        zh: "可选过期时间（ISO 字符串）",
        en: "optional expiration time in ISO format",
    }))
        .option("--json", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }))
        .helpOption("--help", helpText())
        .action(async (name, options) => {
        const normalizedName = String(name || "").trim();
        if (!normalizedName) {
            if (options.json === true) {
                emitCliBlock({
                    tone: "error",
                    title: "Token name is required",
                    note: "JSON 模式下必须显式传入 token 名称。",
                });
                process.exitCode = 1;
                return;
            }
            await runInteractiveCreateCommandFlow({
                expiresAt: options.expiresAt,
            });
            return;
        }
        createToken({
            name: normalizedName,
            expiresAt: options.expiresAt,
            json: options.json === true,
        });
    });
    token
        .command("delete")
        .description(t({
        zh: "删除指定 token",
        en: "delete a selected token",
    }))
        .argument("[tokenId]", t({
        zh: "token 记录 ID",
        en: "token record ID",
    }))
        .option("--json", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }))
        .helpOption("--help", helpText())
        .action(async (tokenId, options) => {
        const normalizedTokenId = String(tokenId || "").trim();
        if (!normalizedTokenId) {
            if (options.json === true) {
                emitCliBlock({
                    tone: "error",
                    title: "Token ID is required",
                    note: "JSON 模式下必须显式传入 tokenId。",
                });
                process.exitCode = 1;
                return;
            }
            const selectedTokenId = await promptTokenIdForDelete();
            if (!selectedTokenId)
                return;
            deleteToken(selectedTokenId, false);
            return;
        }
        deleteToken(normalizedTokenId, options.json === true);
    });
}
//# sourceMappingURL=TokenCommand.js.map