/**
 * `town chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town chat` 进入 chat plugin 共享资源管理，而不是只输出静态 help。
 * - chat account 属于 Town 级共享资源，供各 agent 的 chat plugin 选择绑定。
 * - 访问控制属于 chat plugin 的 access 能力，不再作为独立 plugin 心智暴露。
 * - Town 不管理 chat plugin 运行态；运行态由具体 agent 内部托管。
 */

import prompts from "prompts";
import type { PromptObject } from "prompts";
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
    message: "管理 chat plugin 共享资源",
    choices: [
      {
        title: "管理 chat accounts",
        description: `${accounts.items.length} 个 Town 级共享账号`,
        value: "configureAccounts",
      },
      {
        title: "管理访问控制",
        description: "给 chat 用户分配 access role",
        value: "configureAccess",
      },
      {
        title: "退出",
        description: "关闭 chat manager",
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
    message: "管理 chat plugin 共享资源",
    choices: [
      {
        title: "查看 accounts",
        description: `${accounts.items.length} 个已配置账号`,
        value: "list",
      },
      {
        title: "新增 account",
        description: "新增 Telegram、Feishu 或 QQ 账号",
        value: "add",
      },
      {
        title: "编辑 account",
        description: "修改名称、域名或密钥",
        value: "edit",
      },
      {
        title: "删除 account",
        description: "从 Town 全局账号池删除",
        value: "remove",
      },
      {
        title: "管理访问控制",
        description: "给 chat 用户分配 access role",
        value: "configureAccess",
      },
      {
        title: "返回",
        description: "回到 chat plugin 共享资源菜单",
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
      title: "Chat accounts",
      summary: "0 configured",
      note: "在 `town chat` 中选择“管理 chat accounts”后新增 Telegram、Feishu 或 QQ account。",
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
    message: "选择 channel",
    choices: CHAT_CHANNELS.map((channel) => ({
      title: channel,
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
      title: "No Town chat accounts found",
      note: "先新增一个 Telegram、Feishu 或 QQ account。",
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
    questions.push(
      {
        type: "text",
        name: "appId",
        message: params.current ? "App ID（留空保持不变）" : "App ID",
      },
      {
        type: "password",
        name: "appSecret",
        message: params.current ? "App Secret（留空保持不变）" : "App Secret",
      },
    );
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
    message: "保存前探测 bot 信息？",
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
    message: `删除 ${account.channel} · ${account.name}？`,
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
