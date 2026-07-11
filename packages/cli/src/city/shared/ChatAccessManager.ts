/**
 * Chat Access 交互式管理器。
 *
 * 关键点（中文）
 * - 进入 Access 后先明确选择 Agent，所有列表和操作都固定在该 Agent 的 access.db。
 * - 主流程围绕系统生成的 pending request，不要求管理员重新输入平台用户 ID。
 */

import prompts from "@/city/tui/Prompts.js";
import type { ChatAccessPrincipalView, ChatAccessRequestView } from "@downcity/plugins";
import {
  choose_chat_access_target,
  create_chat_access_service_for_target,
} from "@/city/command/ChatAccessCommand.js";
import type {
  ChatAccessManagerSelection,
  ChatAccessRequestAction,
} from "@/city/types/ChatAccessManager.js";
import { emitCliBlock, emitCliList } from "@/shared/CliReporter.js";
import { t } from "@/shared/CliLocale.js";

function format_identity(request: ChatAccessRequestView): string {
  const principal = request.principal;
  return `${principal.channel}:${principal.issuer}:${principal.subject_id}`;
}

async function choose_request(
  requests: ChatAccessRequestView[],
): Promise<ChatAccessRequestView | null> {
  if (requests.length === 0) {
    emitCliBlock({
      tone: "info",
      title: t({ zh: "没有待处理的 Chat Access 请求", en: "No pending Chat Access requests" }),
    });
    return null;
  }
  const response = (await prompts({
    type: "select",
    name: "request_id",
    message: t({ zh: "选择待处理请求", en: "Select a pending request" }),
    choices: requests.map((request) => ({
      title: request.principal.display_name || request.principal.subject_id,
      description: `${request.request_id} · ${format_identity(request)} · ${request.scope}`,
      value: request.request_id,
    })),
    initial: 0,
  })) as { request_id?: string };
  const request_id = String(response.request_id || "").trim();
  return requests.find((request) => request.request_id === request_id) || null;
}

async function choose_request_action(
  request: ChatAccessRequestView,
): Promise<ChatAccessRequestAction | null> {
  const response = (await prompts({
    type: "select",
    name: "action",
    message: `${request.request_id} · ${format_identity(request)}`,
    choices: [
      {
        title: t({ zh: `批准 ${request.scope}`, en: `Approve ${request.scope}` }),
        value: "approve_scope",
      },
      {
        title: t({ zh: "批准 direct 和 group", en: "Approve direct and group" }),
        value: "approve_all",
      },
      {
        title: t({ zh: `拒绝 ${request.scope}`, en: `Deny ${request.scope}` }),
        value: "deny_scope",
      },
      {
        title: t({ zh: "返回", en: "Back" }),
        value: "back",
      },
    ],
    initial: 0,
  })) as { action?: ChatAccessRequestAction };
  return response.action || null;
}

function show_principals(
  agent_id: string,
  principals: ChatAccessPrincipalView[],
): void {
  emitCliList({
    tone: "accent",
    title: t({ zh: "Chat Access 用户", en: "Chat Access users" }),
    summary: `${principals.length} · ${agent_id}`,
    items: principals.map((item) => ({
      tone: item.grants.some((grant) => grant.effect === "allow") ? "success" : "info",
      title: item.principal.display_name || item.principal.subject_id,
      facts: [
        { label: "Principal", value: item.principal.principal_id },
        { label: "Identity", value: `${item.principal.channel}:${item.principal.issuer}:${item.principal.subject_id}` },
        { label: "Grants", value: item.grants.map((grant) => `${grant.scope}:${grant.effect}`).join(", ") || "none" },
        { label: "Last seen", value: item.principal.last_seen_at },
      ],
    })),
  });
}

/** 运行 Agent 级 Chat Access 管理流程。 */
export async function run_interactive_chat_access_manager(): Promise<void> {
  const target = await choose_chat_access_target();
  const service = create_chat_access_service_for_target(target);

  while (true) {
    const snapshot = service.snapshot();
    const pending_count = snapshot.requests.filter((request) => request.status === "pending").length;
    const response = (await prompts({
      type: "select",
      name: "selection",
      message: `Chat Access · ${target.agent_id}`,
      choices: [
        {
          title: t({ zh: "待处理请求", en: "Pending requests" }),
          description: `${pending_count}`,
          value: { type: "pending" as const },
        },
        {
          title: t({ zh: "已观测用户", en: "Observed users" }),
          description: `${snapshot.principals.length}`,
          value: { type: "principals" as const },
        },
        {
          title: t({ zh: "返回", en: "Back" }),
          value: { type: "back" as const },
        },
      ],
      initial: 0,
    })) as { selection?: ChatAccessManagerSelection };
    const selection = response.selection;
    if (!selection || selection.type === "back") return;

    if (selection.type === "principals") {
      show_principals(target.agent_id, snapshot.principals);
      continue;
    }

    const request = await choose_request(
      snapshot.requests.filter((item) => item.status === "pending"),
    );
    if (!request) continue;
    const action = await choose_request_action(request);
    if (!action || action === "back") continue;

    const grants = action === "deny_scope"
      ? service.deny_request({ request_id: request.request_id, operator: "local-cli" })
      : service.approve_request({
          request_id: request.request_id,
          scope: action === "approve_all" ? "all" : request.scope,
          operator: "local-cli",
        });
    emitCliBlock({
      tone: action === "deny_scope" ? "warning" : "success",
      title: action === "deny_scope"
        ? t({ zh: "Chat Access 已拒绝", en: "Chat Access denied" })
        : t({ zh: "Chat Access 已批准", en: "Chat Access approved" }),
      summary: request.request_id,
      facts: [
        { label: "Agent", value: target.agent_id },
        { label: "Principal", value: request.principal.principal_id },
        { label: "Grants", value: grants.map((grant) => `${grant.scope}:${grant.effect}`).join(", ") },
      ],
    });
  }
}
