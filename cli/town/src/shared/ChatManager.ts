/**
 * `town chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town chat` 进入 chat plugin 共享资源管理，而不是只输出静态 help。
 * - chat account 属于 Town 级共享资源，供各 agent 的 chat plugin 选择绑定。
 * - 访问控制属于 chat plugin 的 access 能力，不再作为独立 plugin 心智暴露。
 * - Town 不管理 chat plugin 运行态；运行态由具体 agent 内部托管。
 */

import prompts, { type PromptObject } from "../tui/Prompts.js";
import {
  ChatChannelAccountManager,
  type ChatChannelAccountListItem,
} from "@downcity/plugins";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import type { StoredChannelAccountChannel } from "@downcity/agent";
import type {
  ChatAccountAction,
  ChatManagerRootAction,
} from "./ChatManagerTypes.js";
import { runInteractiveChatAuthSetFlow } from "../command/ChatAuthCommand.js";
import { t } from "./CliLocale.js";

const CHAT_CHANNELS: StoredChannelAccountChannel[] = ["telegram", "feishu", "qq"];

function createChannelAccountManager(): ChatChannelAccountManager {
  return new ChatChannelAccountManager();
}

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function formatAccountTitle(account: ChatChannelAccountListItem): string {
  const identity = account.identity ? ` · ${account.identity}` : "";
  return `${account.channel} · ${account.name}${identity}`;
}

function formatCredentialSummary(account: ChatChannelAccountListItem): string {
  const parts: string[] = [];
  if (account.botTokenMasked) parts.push(`botToken ${account.botTokenMasked}`);
  if (account.appIdMasked) parts.push(`appId ${account.appIdMasked}`);
  if (account.appSecretMasked) parts.push(`appSecret ${account.appSecretMasked}`);
  if (account.domain) parts.push(`domain ${account.domain}`);
  if (account.sandbox) parts.push("sandbox");
  return parts.join(" · ") || "no credentials";
}

async function promptRootAction(): Promise<ChatManagerRootAction | null> {
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
          zh: "管理",
          en: "Management",
        }),
        disabled: true,
      },
      {
        title: t({
          zh: "Chat 账号管理",
          en: "Chat account management",
        }),
        description: t({
          zh: `${accounts.items.length} 个 Town 级共享账号。Agent 只绑定这些账号，不在 Agent 内重复保存密钥。`,
          en: `${accounts.items.length} Town-level shared accounts. Agents bind to these accounts instead of duplicating credentials.`,
        }),
        value: "configureAccounts",
      },
      {
        title: t({
          zh: "访问控制",
          en: "Manage access control",
        }),
        description: t({
          zh: "给 Chat 用户分配 access role，控制哪些外部用户可以访问 Agent。",
          en: "Assign access roles to chat users and control which external users can access agents.",
        }),
        value: "configureAccess",
      },
      {
        title: t({
          zh: "导航",
          en: "Navigation",
        }),
        disabled: true,
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
  })) as { action?: ChatManagerRootAction };

  return response.action || null;
}

async function promptChatAccountAction(): Promise<ChatAccountAction | null> {
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
          zh: "账号",
          en: "Accounts",
        }),
        disabled: true,
      },
      {
        title: t({
          zh: "查看 Chat 账号",
          en: "View accounts",
        }),
        description: t({
          zh: `${accounts.items.length} 个已配置账号。用于确认 Town 全局账号池里的渠道、身份和密钥状态。`,
          en: `${accounts.items.length} configured accounts. Use this to inspect channels, identities, and credential status in the Town global account pool.`,
        }),
        value: "list",
      },
      {
        title: t({
          zh: "新增 Chat 账号",
          en: "Add account",
        }),
        description: t({
          zh: "新增 Telegram、Feishu 或 QQ 账号，保存为 Town 级共享资源。",
          en: "Add a Telegram, Feishu, or QQ account",
        }),
        value: "add",
      },
      {
        title: t({
          zh: "编辑 Chat 账号",
          en: "Edit account",
        }),
        description: t({
          zh: "修改账号名称、域名或密钥；留空的密钥字段会保持不变。",
          en: "Edit name, domain, or credentials",
        }),
        value: "edit",
      },
      {
        title: t({
          zh: "删除 Chat 账号",
          en: "Remove account",
        }),
        description: t({
          zh: "从 Town 全局账号池删除该账号；已绑定的 Agent 后续会提示清理悬空引用。",
          en: "Remove an account from the Town global pool",
        }),
        value: "remove",
      },
      {
        title: t({
          zh: "权限",
          en: "Access",
        }),
        disabled: true,
      },
      {
        title: t({
          zh: "访问控制",
          en: "Manage access control",
        }),
        description: t({
          zh: "给 Chat 用户分配 access role，控制外部用户访问 Agent 的权限。",
          en: "Assign access roles to chat users and control external access to agents.",
        }),
        value: "configureAccess",
      },
      {
        title: t({
          zh: "导航",
          en: "Navigation",
        }),
        disabled: true,
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
  })) as { action?: ChatAccountAction };

  return response.action || null;
}

async function emitChatAccountList(): Promise<void> {
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

async function chooseChannel(): Promise<StoredChannelAccountChannel | null> {
  const response = (await prompts({
    type: "select",
    name: "channel",
    message: t({
      zh: "选择 Chat 渠道",
      en: "Select chat channel",
    }),
    choices: CHAT_CHANNELS.map((channel) => ({
      title: channel,
      description: t({
        zh: `为新的 Town 级 Chat 账号选择 ${channel} 渠道。`,
        en: `Choose ${channel} as the channel for the new Town-level chat account.`,
      }),
      value: channel,
    })),
    initial: 0,
  })) as { channel?: StoredChannelAccountChannel };

  return response.channel || null;
}

async function chooseAccount(): Promise<ChatChannelAccountListItem | null> {
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
    message: t({
      zh: "选择 Chat 账号",
      en: "Select chat account",
    }),
    choices: items.map((account) => ({
      title: formatAccountTitle(account),
      description: `${account.id} · ${formatCredentialSummary(account)}`,
      value: account.id,
    })),
    initial: 0,
  })) as { id?: string };

  const id = String(response.id || "").trim();
  return items.find((item) => item.id === id) || null;
}

async function promptCredentialFields(params: {
  channel: StoredChannelAccountChannel;
  current?: ChatChannelAccountListItem;
}): Promise<{
  name?: string;
  botToken?: string;
  appId?: string;
  appSecret?: string;
  domain?: string;
  sandbox?: boolean;
}> {
  const questions: PromptObject[] = [
    {
      type: "text",
      name: "name",
      message: t({
        zh: "账号名称",
        en: "Account name",
      }),
      initial: params.current?.name || "",
    },
  ];

  if (params.channel === "telegram") {
    questions.push({
      type: "password",
      name: "botToken",
      message: params.current
        ? t({
          zh: "Bot Token（留空保持不变）",
          en: "Bot token (leave empty to keep unchanged)",
        })
        : t({ zh: "Bot Token", en: "Bot token" }),
    });
  }

  if (params.channel === "feishu" || params.channel === "qq") {
    questions.push(
      {
        type: "text",
        name: "appId",
        message: params.current
          ? t({
            zh: "App ID（留空保持不变）",
            en: "App ID (leave empty to keep unchanged)",
          })
          : t({ zh: "App ID", en: "App ID" }),
      },
      {
        type: "password",
        name: "appSecret",
        message: params.current
          ? t({
            zh: "App Secret（留空保持不变）",
            en: "App secret (leave empty to keep unchanged)",
          })
          : t({ zh: "App Secret", en: "App secret" }),
      },
    );
  }

  if (params.channel === "feishu") {
    questions.push({
      type: "text",
      name: "domain",
      message: t({
        zh: "Domain（可选，例如 open.feishu.cn）",
        en: "Domain (optional, for example open.feishu.cn)",
      }),
      initial: params.current?.domain || "",
    });
  }

  if (params.channel === "qq") {
    questions.push({
      type: "confirm",
      name: "sandbox",
      message: t({
        zh: "启用 QQ sandbox？",
        en: "Enable QQ sandbox?",
      }),
      initial: params.current?.sandbox === true,
    });
  }

  const response = (await prompts(questions)) as {
    name?: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  };

  return response;
}

async function addChannelAccount(): Promise<void> {
  const channel = await chooseChannel();
  if (!channel) return;

  const input = await promptCredentialFields({ channel });
  const name = String(input.name || "").trim();

  const probeResponse = (await prompts({
    type: "confirm",
    name: "probe",
    message: t({
      zh: "保存前探测 bot 信息？",
      en: "Probe bot info before saving?",
    }),
    initial: true,
  })) as { probe?: boolean };

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

async function editChannelAccount(): Promise<void> {
  const account = await chooseAccount();
  if (!account) return;

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

async function removeChannelAccount(): Promise<void> {
  const account = await chooseAccount();
  if (!account) return;

  const response = (await prompts({
    type: "confirm",
    name: "remove",
    message: t({
      zh: `删除 ${account.channel} · ${account.name}？`,
      en: `Remove ${account.channel} · ${account.name}?`,
    }),
    initial: false,
  })) as { remove?: boolean };

  if (response.remove !== true) return;

  const manager = createChannelAccountManager();
  await manager.remove(account.id);
  emitCliBlock({
    tone: "success",
    title: "Chat account removed",
    summary: account.id,
  });
}

async function runChatAccountManager(): Promise<void> {
  while (true) {
    const action = await promptChatAccountAction();
    if (!action || action === "back") return;

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
    } catch (error) {
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
export async function runInteractiveChatManager(): Promise<void> {
  if (!isInteractiveTerminal()) return;

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
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Chat manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
