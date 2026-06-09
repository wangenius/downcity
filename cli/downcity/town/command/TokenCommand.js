/**
 * `town token` 命令树。
 *
 * 关键点（中文）
 * - token 管理只允许在本机 CLI 执行，不再暴露用户名密码登录流。
 * - 根命令支持交互式入口，减少用户记忆负担。
 * - 子命令依旧保留脚本友好的非交互模式，便于自动化调用。
 */
import { spawnSync } from "node:child_process";
import prompts from "../tui/Prompts.js";
import { AuthService } from "../town/auth/AuthService.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { helpText, t } from "../shared/CliLocale.js";
function isInteractiveTerminal() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
function isTokenExpired(token) {
    if (!token.expiresAt)
        return false;
    return new Date(token.expiresAt).getTime() <= Date.now();
}
function resolveTokenState(token) {
    if (isTokenExpired(token))
        return "expired";
    return "active";
}
function formatTokenStateLabel(token) {
    const state = resolveTokenState(token);
    if (state === "expired")
        return "expired";
    return "active";
}
function resolveTokenTone(token) {
    const state = resolveTokenState(token);
    if (state === "active")
        return "accent";
    return "warning";
}
function buildTokenFacts(token) {
    return [
        {
            label: "Id",
            value: token.id,
        },
        {
            label: "State",
            value: formatTokenStateLabel(token),
        },
        {
            label: "Created",
            value: token.createdAt,
        },
        ...(token.updatedAt
            ? [
                {
                    label: "Updated",
                    value: token.updatedAt,
                },
            ]
            : []),
        ...(token.lastUsedAt
            ? [
                {
                    label: "Last used",
                    value: token.lastUsedAt,
                },
            ]
            : []),
        ...(token.expiresAt
            ? [
                {
                    label: "Expires",
                    value: token.expiresAt,
                },
            ]
            : []),
    ];
}
function printTokenList(tokens, json = false) {
    if (json === true) {
        printResult({
            asJson: true,
            success: true,
            title: "tokens",
            payload: { tokens },
        });
        return;
    }
    if (tokens.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "Tokens",
            summary: "0 configured",
            note: "当前还没有本机 token，可执行 `town token create <name>`。",
        });
        return;
    }
    emitCliList({
        tone: "accent",
        title: "Tokens",
        summary: `${tokens.length} configured`,
        items: tokens.map((item) => ({
            tone: resolveTokenTone(item),
            title: item.name,
            facts: buildTokenFacts(item),
        })),
    });
}
function emitTokenDetail(token) {
    emitCliBlock({
        tone: resolveTokenTone(token),
        title: token.name,
        summary: formatTokenStateLabel(token),
        facts: buildTokenFacts(token),
        note: resolveTokenState(token) === "active"
            ? "历史明文 token 不会被保存；只有新签发时才会显示一次。"
            : undefined,
    });
}
function createToken(params) {
    const authService = new AuthService();
    try {
        const issued = authService.createLocalCliToken({
            name: params.name,
            expiresAt: params.expiresAt,
        });
        if (params.json === true) {
            printResult({
                asJson: true,
                success: true,
                title: "token created",
                payload: { token: issued },
            });
            return issued;
        }
        emitCliBlock({
            tone: "success",
            title: "Token created",
            summary: issued.name,
            facts: [
                {
                    label: "Id",
                    value: issued.id,
                },
                {
                    label: "Token",
                    value: issued.token,
                },
            ],
            note: "明文 token 只会在本次创建时显示一次。",
        });
        return issued;
    }
    finally {
        authService.close();
    }
}
function deleteToken(tokenId, json = false) {
    const authService = new AuthService();
    try {
        const tokens = authService.listLocalCliTokens();
        const deleted = tokens.find((item) => item.id === tokenId);
        authService.deleteLocalCliToken(tokenId);
        if (json === true) {
            printResult({
                asJson: true,
                success: true,
                title: "token deleted",
                payload: { tokenId },
            });
            return;
        }
        emitCliBlock({
            tone: "success",
            title: "Token deleted",
            summary: deleted?.name || tokenId,
            facts: [
                {
                    label: "Id",
                    value: tokenId,
                },
            ],
        });
    }
    finally {
        authService.close();
    }
}
function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value)
        return { success: false };
    const backends = [
        {
            command: "pbcopy",
            args: [],
        },
        {
            command: "wl-copy",
            args: [],
        },
        {
            command: "xclip",
            args: ["-selection", "clipboard"],
        },
        {
            command: "clip",
            args: [],
        },
    ];
    for (const backend of backends) {
        const result = spawnSync(backend.command, backend.args, {
            input: value,
            encoding: "utf8",
        });
        if (!result.error && result.status === 0) {
            return {
                success: true,
                backend: backend.command,
            };
        }
    }
    return { success: false };
}
function emitTokenSetupGuide(token) {
    emitCliBlock({
        tone: "info",
        title: "Token ready",
        facts: [
            {
                label: "Name",
                value: token.name,
            },
            {
                label: "Token",
                value: token.token,
            },
            {
                label: "Next",
                value: "把刚创建的 Bearer Token 粘贴到需要访问的 Extension 或脚本环境",
            },
        ],
    });
}
async function promptTokenCreateInput(params) {
    if (!isInteractiveTerminal()) {
        emitCliBlock({
            tone: "error",
            title: "Token name is required",
            note: "Use `town token create <name>` or run this command in an interactive terminal.",
        });
        return null;
    }
    const response = (await prompts([
        {
            type: "text",
            name: "name",
            message: "Token 名称",
            initial: String(params?.defaultName || "").trim() || "town-client",
            validate: (value) => {
                return String(value || "").trim() ? true : "请输入 token 名称";
            },
        },
        {
            type: "text",
            name: "expiresAt",
            message: "过期时间（可选，ISO 字符串）",
            initial: String(params?.defaultExpiresAt || "").trim(),
            validate: (value) => {
                const normalized = String(value || "").trim();
                if (!normalized)
                    return true;
                return Number.isNaN(Date.parse(normalized))
                    ? "请输入合法的 ISO 时间，例如 2026-04-30T00:00:00.000Z"
                    : true;
            },
        },
    ]));
    const name = String(response.name || "").trim();
    if (!name) {
        emitCliBlock({
            tone: "info",
            title: "Token create cancelled",
        });
        return null;
    }
    const expiresAt = String(response.expiresAt || "").trim();
    return {
        name,
        expiresAt: expiresAt || undefined,
    };
}
async function promptTokenIdForDelete() {
    if (!isInteractiveTerminal()) {
        emitCliBlock({
            tone: "error",
            title: "Token ID is required",
            note: "Use `town token delete <tokenId>` or run this command in an interactive terminal.",
        });
        return null;
    }
    const authService = new AuthService();
    try {
        const tokens = authService.listLocalCliTokens();
        if (tokens.length === 0) {
            emitCliBlock({
                tone: "info",
                title: "No tokens",
                note: "可先执行 `town token create`。",
            });
            return null;
        }
        const response = (await prompts({
            type: "select",
            name: "tokenId",
            message: "选择要删除的 token",
            choices: tokens.map((item) => ({
                title: item.name,
                description: item.id,
                value: item.id,
            })),
            initial: 0,
        }));
        const tokenId = String(response.tokenId || "").trim();
        if (!tokenId) {
            emitCliBlock({
                tone: "info",
                title: "Token delete cancelled",
            });
            return null;
        }
        return tokenId;
    }
    finally {
        authService.close();
    }
}
function loadLocalCliTokens() {
    const authService = new AuthService();
    try {
        return authService.listLocalCliTokens();
    }
    finally {
        authService.close();
    }
}
async function runInteractivePostCreateActions(params) {
    while (true) {
        const response = (await prompts({
            type: "select",
            name: "action",
            message: "创建完成，下一步要做什么？",
            choices: [
                {
                    title: "复制 token",
                    description: "把刚签发的明文 token 复制到系统剪贴板",
                    value: "copy",
                },
                {
                    title: "查看接入说明",
                    description: "显示 token 的通用使用说明",
                    value: "guide",
                },
                {
                    title: "返回",
                    description: "回到上一级菜单",
                    value: "back",
                },
            ],
            initial: 0,
        }));
        const action = String(response.action || "").trim();
        if (!action || action === "back")
            return;
        if (action === "copy") {
            const copied = copyTextToClipboard(params.issued.token);
            emitCliBlock({
                tone: copied.success ? "success" : "warning",
                title: copied.success ? "Token copied" : "Clipboard unavailable",
                facts: copied.success
                    ? [
                        {
                            label: "Backend",
                            value: String(copied.backend || "clipboard"),
                        },
                    ]
                    : [],
                note: copied.success
                    ? "当前剪贴板里已经是刚签发的 Bearer Token。"
                    : "当前环境没有可用的剪贴板命令，请直接复制终端里显示的 token。",
            });
            continue;
        }
        if (action === "guide") {
            emitTokenSetupGuide(params.issued);
            continue;
        }
    }
}
async function runInteractiveCreateFlow() {
    const input = await promptTokenCreateInput({
        defaultName: "token",
    });
    if (!input)
        return;
    const issued = createToken(input);
    await runInteractivePostCreateActions({
        issued,
    });
}
async function runInteractiveCreateCommandFlow(options) {
    const input = await promptTokenCreateInput({
        defaultName: "token",
        defaultExpiresAt: options.expiresAt,
    });
    if (!input)
        return;
    const issued = createToken(input);
    await runInteractivePostCreateActions({
        issued,
    });
}
async function runInteractiveTokenBrowser() {
    while (true) {
        const tokens = loadLocalCliTokens();
        if (tokens.length === 0) {
            emitCliBlock({
                tone: "info",
                title: "Tokens",
                summary: "0 configured",
                note: "当前还没有本机 token，可先执行创建流程。",
            });
            return;
        }
        const response = (await prompts({
            type: "select",
            name: "tokenId",
            message: "选择一个 token 查看详情",
            choices: [
                ...tokens.map((item) => ({
                    title: item.name,
                    description: `${formatTokenStateLabel(item)} · ${item.id}`,
                    value: item.id,
                })),
                {
                    title: "返回",
                    description: "回到上一级菜单",
                    value: "__back__",
                },
            ],
            initial: 0,
        }));
        const tokenId = String(response.tokenId || "").trim();
        if (!tokenId || tokenId === "__back__")
            return;
        while (true) {
            const current = loadLocalCliTokens().find((item) => item.id === tokenId);
            if (!current) {
                emitCliBlock({
                    tone: "warning",
                    title: "Token not found",
                    note: "该 token 可能已经被其他命令删除。",
                });
                break;
            }
            emitTokenDetail(current);
            const actionResponse = (await prompts({
                type: "select",
                name: "action",
                message: "选择后续操作",
                choices: [
                    {
                        title: "删除 token",
                        description: "立即删除当前 token",
                        value: "delete",
                    },
                    {
                        title: "返回 token 列表",
                        description: "继续浏览其他 token",
                        value: "back",
                    },
                ],
                initial: 0,
            }));
            const action = String(actionResponse.action || "").trim();
            if (!action || action === "back")
                break;
            if (action === "delete") {
                deleteToken(current.id, false);
            }
        }
    }
}
async function runInteractiveTokenCommand() {
    if (!isInteractiveTerminal()) {
        emitCliBlock({
            tone: "info",
            title: "Token command",
            note: "Use `town token --help` for scriptable usage, or run `town token` in an interactive terminal.",
        });
        return;
    }
    while (true) {
        const tokens = loadLocalCliTokens();
        const response = (await prompts({
            type: "select",
            name: "action",
            message: "选择 token 操作",
            choices: [
                {
                    title: "浏览 token",
                    description: `查看 ${tokens.length} 个 token 的详情和状态`,
                    value: "browse",
                },
                {
                    title: "创建 token",
                    description: "签发新的 Bearer Token，并继续后续接入配置",
                    value: "create",
                },
                {
                    title: "删除 token",
                    description: "删除已有 token",
                    value: "delete",
                },
                {
                    title: "退出",
                    description: "结束交互式 token 管理",
                    value: "exit",
                },
            ],
            initial: tokens.length > 0 ? 0 : 1,
        }));
        const action = String(response.action || "").trim();
        if (!action || action === "exit") {
            emitCliBlock({
                tone: "info",
                title: "Token command finished",
            });
            return;
        }
        if (action === "browse") {
            await runInteractiveTokenBrowser();
            continue;
        }
        if (action === "create") {
            await runInteractiveCreateFlow();
            continue;
        }
        if (action === "delete") {
            const tokenId = await promptTokenIdForDelete();
            if (!tokenId) {
                continue;
            }
            deleteToken(tokenId, false);
            continue;
        }
    }
}
/**
 * 注册 `town token` 命令。
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