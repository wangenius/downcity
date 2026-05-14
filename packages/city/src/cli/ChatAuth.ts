/**
 * `city chat auth` CLI 辅助模块。
 *
 * 关键点（中文）
 * - chat authorization 属于 city 全局 chat service 策略。
 * - 授权主体使用 `<platform>:<platformUserId>`，例如 `telegram:12345678`。
 * - 管理员执行 `city chat auth set telegram:12345678` 后交互式选择 role。
 */

import prompts from "prompts";
import type { Command } from "commander";
import { emitCliBlock } from "./CliReporter.js";
import { parseBoolean } from "./IndexSupport.js";
import {
  listChatAuthorizationRoles,
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
} from "@/plugins/auth/runtime/AuthorizationConfig.js";
import { resolveAuthorizedUserRole } from "@/plugins/auth/runtime/AuthorizationPolicy.js";
import {
  isChatAuthorizationChannel,
  type ChatAuthorizationChannel,
  type ChatAuthorizationRole,
} from "@/shared/types/AuthPlugin.js";

type ChatAuthSetOptions = {
  /**
   * 非交互式直接指定 roleId。
   */
  role?: string;
  /**
   * 是否以 JSON 输出。
   */
  json?: boolean;
};

type ParsedPrincipal = {
  /**
   * 授权主体所在平台。
   */
  channel: ChatAuthorizationChannel;
  /**
   * 平台用户 ID。
   */
  userId: string;
};

function parsePrincipal(principalInput: string): ParsedPrincipal {
  const principal = String(principalInput || "").trim();
  const separator = principal.indexOf(":");
  if (separator <= 0 || separator === principal.length - 1) {
    throw new Error("principal 格式应为 <platform>:<userId>，例如 telegram:12345678");
  }
  const channel = principal.slice(0, separator).trim().toLowerCase();
  const userId = principal.slice(separator + 1).trim();
  if (!isChatAuthorizationChannel(channel)) {
    throw new Error("platform 仅支持 telegram、feishu、qq");
  }
  if (!userId) {
    throw new Error("userId 不能为空");
  }
  return { channel, userId };
}

function findRole(roles: ChatAuthorizationRole[], roleId: string): ChatAuthorizationRole | null {
  return roles.find((role) => role.roleId === roleId) || null;
}

async function chooseRole(params: {
  roles: ChatAuthorizationRole[];
  currentRoleId?: string;
}): Promise<ChatAuthorizationRole | null> {
  const initial = Math.max(
    0,
    params.roles.findIndex((role) => role.roleId === params.currentRoleId),
  );
  const response = (await prompts({
    type: "select",
    name: "roleId",
    message: "选择新的 auth role",
    choices: params.roles.map((role) => ({
      title: role.roleId,
      description: `${role.name} · ${role.permissions.length} permissions`,
      value: role.roleId,
    })),
    initial,
  })) as { roleId?: string };
  const roleId = String(response.roleId || "").trim();
  if (!roleId) return null;
  return findRole(params.roles, roleId);
}

/**
 * 设置授权主体角色。
 */
export async function runChatAuthSet(params: {
  principal: string;
  options?: ChatAuthSetOptions;
}): Promise<void> {
  const principal = parsePrincipal(params.principal);
  const config = readChatAuthorizationConfigSync();
  const roles = listChatAuthorizationRoles({ config });
  const currentRole = resolveAuthorizedUserRole({
    channel: principal.channel,
    userId: principal.userId,
    authorizationConfig: config,
  });

  let nextRole: ChatAuthorizationRole | null = null;
  const explicitRoleId = String(params.options?.role || "").trim();
  if (explicitRoleId) {
    nextRole = findRole(roles, explicitRoleId);
    if (!nextRole) throw new Error(`Unknown role: ${explicitRoleId}`);
  } else {
    emitCliBlock({
      tone: "info",
      title: "Chat auth principal",
      facts: [
        { label: "Principal", value: `${principal.channel}:${principal.userId}` },
        { label: "Current role", value: currentRole?.roleId || "default" },
        { label: "Scope", value: "city" },
      ],
    });
    nextRole = await chooseRole({
      roles,
      currentRoleId: currentRole?.roleId,
    });
  }

  if (!nextRole) return;

  await setChatAuthorizationUserRole({
    channel: principal.channel,
    userId: principal.userId,
    roleId: nextRole.roleId,
  });

  emitCliBlock({
    tone: "success",
    title: "Chat auth role updated",
    summary: `${principal.channel}:${principal.userId} -> ${nextRole.roleId}`,
    facts: [
      { label: "Role", value: nextRole.name },
      { label: "Scope", value: "city" },
    ],
  });
}

/**
 * 交互式输入授权主体并设置角色。
 */
export async function runInteractiveChatAuthSetFlow(options?: ChatAuthSetOptions): Promise<void> {
  const response = (await prompts({
    type: "text",
    name: "principal",
    message: "输入授权主体（例如 telegram:12345678）",
  })) as { principal?: string };
  const principal = String(response.principal || "").trim();
  if (!principal) return;
  await runChatAuthSet({
    principal,
    options,
  });
}

/**
 * 注册 `city chat auth` 命令。
 */
export function registerChatAuthCommands(chat: Command): void {
  const auth = chat
    .command("auth")
    .description("管理 city 全局 chat authorization")
    .helpOption("--help", "display help for command");

  auth
    .command("set <principal>")
    .description("给授权主体设置角色，例如：city chat auth set telegram:12345678")
    .option("--role <roleId>", "直接指定 roleId；不传则交互式选择")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, false)
    .action(async (principal: string, options: ChatAuthSetOptions) => {
      await runChatAuthSet({
        principal,
        options,
      });
    });
}
