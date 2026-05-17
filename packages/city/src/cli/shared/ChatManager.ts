/**
 * `city chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `city chat` 进入 chat service 管理，而不是只输出静态 help。
 * - chat channel account 属于 city 级配置，在这里通过“配置 channel”管理。
 * - agent 只绑定 channel account，不在 agent 流程中维护密钥。
 */

import prompts from "prompts";
import type { PromptObject } from "prompts";
import {
  ChatChannelAccountService,
  type ChatChannelAccountListItem,
} from "@downcity/agent";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { runServiceControlCommand } from "../service/ServiceCommandRemote.js";
import type { StoredChannelAccountChannel } from "@downcity/agent";
import type {
  ChatChannelAccountAction,
  ChatManagerRootAction,
} from "./ChatManagerTypes.js";
import { runInteractiveChatAuthSetFlow } from "./ChatAuth.js";

const CHAT_CHANNELS: StoredChannelAccountChannel[] = ["telegram", "feishu", "qq"];

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
  const service = new ChatChannelAccountService();
  const accounts = await service.list();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: "管理 chat service",
    choices: [
      {
        title: "查看状态",
        description: "查看当前项目 chat service 运行状态",
        value: "status",
      },
      {
        title: "启动",
        description: "启动当前项目 chat service",
        value: "start",
      },
      {
        title: "停止",
        description: "停止当前项目 chat service",
        value: "stop",
      },
      {
        title: "重启",
        description: "重启当前项目 chat service",
        value: "restart",
      },
      {
        title: "配置 channel",
        description: `${accounts.items.length} 个 city 级 channel account`,
        value: "configureChannels",
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

async function promptChannelAccountAction(): Promise<ChatChannelAccountAction | null> {
  const service = new ChatChannelAccountService();
  const accounts = await service.list();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: "配置 chat channel accounts",
    choices: [
      {
        title: "查看 accounts",
        description: `${accounts.items.length} 个已配置账号`,
        value: "list",
      },
      {
        title: "新增 account",
        description: "配置 Telegram、Feishu 或 QQ 账号",
        value: "add",
      },
      {
        title: "编辑 account",
        description: "修改名称、域名或密钥",
        value: "edit",
      },
      {
        title: "删除 account",
        description: "从 city 全局账号池删除",
        value: "remove",
      },
      {
        title: "配置 authorization",
        description: "给平台用户分配 auth role",
        value: "configureAuthorization",
      },
      {
        title: "返回",
        description: "回到 chat service 菜单",
        value: "back",
      },
    ],
    initial: 0,
  })) as { action?: ChatChannelAccountAction };

  return response.action || null;
}

async function emitChannelAccountList(): Promise<void> {
  const service = new ChatChannelAccountService();
  const { items } = await service.list();
  if (items.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Chat channel accounts",
      summary: "0 configured",
      note: "在 `city chat` 中选择“配置 channel”后新增 Telegram、Feishu 或 QQ account。",
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "Chat channel accounts",
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
  const service = new ChatChannelAccountService();
  const { items } = await service.list();
  if (items.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "No city channel accounts found",
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

  const service = new ChatChannelAccountService();
  const result = await service.create({
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
    title: "Channel account saved",
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
  const service = new ChatChannelAccountService();
  await service.upsert({
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
    title: "Channel account updated",
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

  const service = new ChatChannelAccountService();
  service.remove(account.id);
  emitCliBlock({
    tone: "success",
    title: "Channel account removed",
    summary: account.id,
  });
}

async function runChannelAccountManager(): Promise<void> {
  while (true) {
    const action = await promptChannelAccountAction();
    if (!action || action === "back") return;

    try {
      if (action === "list") {
        await emitChannelAccountList();
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
      if (action === "configureAuthorization") {
        await runInteractiveChatAuthSetFlow();
      }
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Channel account action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runChatLifecycleAction(
  action: "start" | "stop" | "restart" | "status",
): Promise<void> {
  await runServiceControlCommand({
    serviceName: "chat",
    action,
    options: {
      path: ".",
      json: false,
    },
  });
}

/**
 * 运行 `city chat` 交互式管理器。
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
      if (action === "configureChannels") {
        await runChannelAccountManager();
        continue;
      }
      await runChatLifecycleAction(action);
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Chat manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
