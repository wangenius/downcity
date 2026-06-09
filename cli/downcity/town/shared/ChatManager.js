/**
 * `town chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town chat` 进入 chat plugin 共享资源管理，而不是只输出静态 help。
 * - chat account 属于 Town 级共享资源，供各 agent 的 chat plugin 选择绑定。
 * - 访问控制属于 chat plugin 的 access 能力，不再作为独立 plugin 心智暴露。
 * - Town 不管理 chat plugin 运行态；运行态由具体 agent 内部托管。
 */
import prompts from "../tui/Prompts.js";
import { ChatChannelAccountManager, } from "@downcity/plugins";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { runInteractiveChatAuthSetFlow } from "../command/ChatAuthCommand.js";
import { t } from "./CliLocale.js";
const CHAT_CHANNELS = ["telegram", "feishu", "qq"];
function createChannelAccountManager() {
    return new ChatChannelAccountManager();
}
function isInteractiveTerminal() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
function formatAccountTitle(account) {
    const identity = account.identity ? ` · ${account.identity}` : "";
    return `${account.channel} · ${account.name}${identity}`;
}
function formatCredentialSummary(account) {
    const parts = [];
    if (account.botTokenMasked)
        parts.push(`botToken ${account.botTokenMasked}`);
    if (account.appIdMasked)
        parts.push(`appId ${account.appIdMasked}`);
    if (account.appSecretMasked)
        parts.push(`appSecret ${account.appSecretMasked}`);
    if (account.domain)
        parts.push(`domain ${account.domain}`);
    if (account.sandbox)
        parts.push("sandbox");
    return parts.join(" · ") || "no credentials";
}
async function promptRootAction() {
    const manager = createChannelAccountManager();
    const accounts = await manager.list();
    const response = (await prompts({
        type: "select",
        name: "action",
        message: t({
            zh: "管理 chat plugin 共享资源",
            en: "Manage chat plugin shared resources",
        }),
        choices: [
            {
                title: t({
                    zh: "管理 chat accounts",
                    en: "Manage chat accounts",
                }),
                description: t({
                    zh: `${accounts.items.length} 个 Town 级共享账号`,
                    en: `${accounts.items.length} Town-level shared accounts`,
                }),
                value: "configureAccounts",
            },
            {
                title: t({
                    zh: "管理访问控制",
                    en: "Manage access control",
                }),
                description: t({
                    zh: "给 chat 用户分配 access role",
                    en: "Assign access roles to chat users",
                }),
                value: "configureAccess",
            },
            {
                title: t({
                    zh: "退出",
                    en: "Exit",
                }),
                description: t({
                    zh: "关闭 chat manager",
                    en: "Close the chat manager",
                }),
                value: "exit",
            },
        ],
        initial: 0,
    }));
    return response.action || null;
}
async function promptChatAccountAction() {
    const manager = createChannelAccountManager();
    const accounts = await manager.list();
    const response = (await prompts({
        type: "select",
        name: "action",
        message: t({
            zh: "管理 chat plugin 共享资源",
            en: "Manage chat plugin shared resources",
        }),
        choices: [
            {
                title: t({
                    zh: "查看 accounts",
                    en: "View accounts",
                }),
                description: t({
                    zh: `${accounts.items.length} 个已配置账号`,
                    en: `${accounts.items.length} configured accounts`,
                }),
                value: "list",
            },
            {
                title: t({
                    zh: "新增 account",
                    en: "Add account",
                }),
                description: t({
                    zh: "新增 Telegram、Feishu 或 QQ 账号",
                    en: "Add a Telegram, Feishu, or QQ account",
                }),
                value: "add",
            },
            {
                title: t({
                    zh: "编辑 account",
                    en: "Edit account",
                }),
                description: t({
                    zh: "修改名称、域名或密钥",
                    en: "Edit name, domain, or credentials",
                }),
                value: "edit",
            },
            {
                title: t({
                    zh: "删除 account",
                    en: "Remove account",
                }),
                description: t({
                    zh: "从 Town 全局账号池删除",
                    en: "Remove an account from the Town global pool",
                }),
                value: "remove",
            },
            {
                title: t({
                    zh: "管理访问控制",
                    en: "Manage access control",
                }),
                description: t({
                    zh: "给 chat 用户分配 access role",
                    en: "Assign access roles to chat users",
                }),
                value: "configureAccess",
            },
            {
                title: t({
                    zh: "返回",
                    en: "Back",
                }),
                description: t({
                    zh: "回到 chat plugin 共享资源菜单",
                    en: "Return to the chat shared resources menu",
                }),
                value: "back",
            },
        ],
        initial: 0,
    }));
    return response.action || null;
}
async function emitChatAccountList() {
    const manager = createChannelAccountManager();
    const { items } = await manager.list();
    if (items.length === 0) {
        emitCliBlock({
            tone: "info",
            title: t({
                zh: "Chat accounts",
                en: "Chat accounts",
            }),
            summary: "0 configured",
            note: t({
                zh: "在 `town chat` 中选择“管理 chat accounts”后新增 Telegram、Feishu 或 QQ account。",
                en: "Add a Telegram, Feishu, or QQ account from `town chat` -> `Manage chat accounts`.",
            }),
        });
        return;
    }
    emitCliList({
        tone: "accent",
        title: "Chat accounts",
        summary: `${items.length} configured`,
        items: items.map((account) => ({
            title: formatAccountTitle(account),
            facts: [
                { label: "ID", value: account.id },
                { label: "Credentials", value: formatCredentialSummary(account) },
                { label: "Updated", value: account.updatedAt },
            ],
        })),
    });
}
async function chooseChannel() {
    const response = (await prompts({
        type: "select",
        name: "channel",
        message: t({
            zh: "选择 channel",
            en: "Select channel",
        }),
        choices: CHAT_CHANNELS.map((channel) => ({
            title: channel,
            value: channel,
        })),
        initial: 0,
    }));
    return response.channel || null;
}
async function chooseAccount() {
    const manager = createChannelAccountManager();
    const { items } = await manager.list();
    if (items.length === 0) {
        emitCliBlock({
            tone: "info",
            title: t({
                zh: "未找到 Town chat account",
                en: "No Town chat accounts found",
            }),
            note: t({
                zh: "请先新增一个 Telegram、Feishu 或 QQ account。",
                en: "Add a Telegram, Feishu, or QQ account first.",
            }),
        });
        return null;
    }
    const response = (await prompts({
        type: "select",
        name: "id",
        message: "选择 account",
        choices: items.map((account) => ({
            title: formatAccountTitle(account),
            description: `${account.id} · ${formatCredentialSummary(account)}`,
            value: account.id,
        })),
        initial: 0,
    }));
    const id = String(response.id || "").trim();
    return items.find((item) => item.id === id) || null;
}
async function promptCredentialFields(params) {
    const questions = [
        {
            type: "text",
            name: "name",
            message: "账号名称",
            initial: params.current?.name || "",
        },
    ];
    if (params.channel === "telegram") {
        questions.push({
            type: "password",
            name: "botToken",
            message: params.current ? "Bot Token（留空保持不变）" : "Bot Token",
        });
    }
    if (params.channel === "feishu" || params.channel === "qq") {
        questions.push({
            type: "text",
            name: "appId",
            message: params.current ? "App ID（留空保持不变）" : "App ID",
        }, {
            type: "password",
            name: "appSecret",
            message: params.current ? "App Secret（留空保持不变）" : "App Secret",
        });
    }
    if (params.channel === "feishu") {
        questions.push({
            type: "text",
            name: "domain",
            message: "Domain（可选，例如 open.feishu.cn）",
            initial: params.current?.domain || "",
        });
    }
    if (params.channel === "qq") {
        questions.push({
            type: "confirm",
            name: "sandbox",
            message: "启用 QQ sandbox？",
            initial: params.current?.sandbox === true,
        });
    }
    const response = (await prompts(questions));
    return response;
}
async function addChannelAccount() {
    const channel = await chooseChannel();
    if (!channel)
        return;
    const input = await promptCredentialFields({ channel });
    const name = String(input.name || "").trim();
    const probeResponse = (await prompts({
        type: "confirm",
        name: "probe",
        message: "保存前探测 bot 信息？",
        initial: true,
    }));
    const manager = createChannelAccountManager();
    const result = await manager.create({
        channel,
        name,
        botToken: input.botToken,
        appId: input.appId,
        appSecret: input.appSecret,
        domain: input.domain,
        sandbox: input.sandbox,
        probe: probeResponse.probe !== false,
    });
    emitCliBlock({
        tone: "success",
        title: "Chat account saved",
        summary: result.id,
        note: result.message || (result.probed ? "bot 信息已探测" : "已按输入信息保存"),
    });
}
async function editChannelAccount() {
    const account = await chooseAccount();
    if (!account)
        return;
    const input = await promptCredentialFields({
        channel: account.channel,
        current: account,
    });
    const manager = createChannelAccountManager();
    await manager.upsert({
        id: account.id,
        channel: account.channel,
        name: String(input.name || account.name).trim(),
        botToken: String(input.botToken || "").trim() || undefined,
        appId: String(input.appId || "").trim() || undefined,
        appSecret: String(input.appSecret || "").trim() || undefined,
        domain: input.domain,
        sandbox: input.sandbox,
    });
    emitCliBlock({
        tone: "success",
        title: "Chat account updated",
        summary: account.id,
    });
}
async function removeChannelAccount() {
    const account = await chooseAccount();
    if (!account)
        return;
    const response = (await prompts({
        type: "confirm",
        name: "remove",
        message: `删除 ${account.channel} · ${account.name}？`,
        initial: false,
    }));
    if (response.remove !== true)
        return;
    const manager = createChannelAccountManager();
    await manager.remove(account.id);
    emitCliBlock({
        tone: "success",
        title: "Chat account removed",
        summary: account.id,
    });
}
async function runChatAccountManager() {
    while (true) {
        const action = await promptChatAccountAction();
        if (!action || action === "back")
            return;
        try {
            if (action === "list") {
                await emitChatAccountList();
                continue;
            }
            if (action === "add") {
                await addChannelAccount();
                continue;
            }
            if (action === "edit") {
                await editChannelAccount();
                continue;
            }
            if (action === "remove") {
                await removeChannelAccount();
                continue;
            }
            if (action === "configureAccess") {
                await runInteractiveChatAuthSetFlow();
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Chat account action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
/**
 * 运行 `town chat` 交互式管理器。
 */
export async function runInteractiveChatManager() {
    if (!isInteractiveTerminal())
        return;
    while (true) {
        const action = await promptRootAction();
        if (!action || action === "exit") {
            emitCliBlock({
                tone: "info",
                title: "Chat manager closed",
            });
            return;
        }
        try {
            if (action === "configureAccounts") {
                await runChatAccountManager();
                continue;
            }
            if (action === "configureAccess") {
                await runInteractiveChatAuthSetFlow();
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Chat manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
//# sourceMappingURL=ChatManager.js.map