/**
 * 当前 City server 的默认工作区入口。
 *
 * 关键说明（中文）
 * - connect 成功后默认进入 user 登录 / user 工作区
 * - 只有当用户主动进入 server management 时，才触发 admin 相关能力
 */

import { isCancel, select } from "@clack/prompts";
import { userAuth } from "../auth/user.js";
import { readConfig, readServer, readUserSession } from "../core/session.js";
import { showError } from "../core/ui.js";
import { type ServerEntryAction } from "../types/Interactive.js";
import { userLoop } from "../user/loop.js";
import { openServerManagement } from "./ServerManagement.js";

/**
 * 打开某个 server 的默认工作区。
 */
export async function openServerWorkspace(base_url: string): Promise<"home" | "quit"> {
  let current_base_url = base_url;
  let should_auto_sign_in = true;

  while (true) {
    const server = readServer(current_base_url);
    if (!server) {
      return "home";
    }

    current_base_url = server.base_url;

    const user_session = readUserSession(current_base_url);
    if (!user_session) {
      if (should_auto_sign_in) {
        const ctx = await userAuth(current_base_url);
        if (ctx) {
          should_auto_sign_in = true;
          continue;
        }
        should_auto_sign_in = false;
      }

      const entry_action = await selectServerEntryAction(current_base_url);
      if (entry_action === "quit") {
        return "quit";
      }
      if (entry_action === "back") {
        return "home";
      }
      if (entry_action === "server_management") {
        const result = await openServerManagement(current_base_url);
        if (result === "quit") {
          return "quit";
        }
        continue;
      }

      const ctx = await userAuth(current_base_url);
      if (ctx) {
        should_auto_sign_in = true;
      }
      continue;
    }

    should_auto_sign_in = true;

    const result = await userLoop({
      session: user_session,
      config: readConfig(),
    });

    if (result === "quit") {
      return "quit";
    }
    if (result === "switch_server") {
      return "home";
    }
    if (result === "server_management") {
      const management_result = await openServerManagement(current_base_url);
      if (management_result === "quit") {
        return "quit";
      }
      continue;
    }

    // 用户主动 sign out 后，不要立刻再次弹出登录流程，先回到当前 server 的入口页。
    should_auto_sign_in = false;
  }
}

async function selectServerEntryAction(base_url: string): Promise<ServerEntryAction> {
  const server = readServer(base_url);
  if (!server) {
    showError("Current City no longer exists.");
    return "back";
  }

  const selected = await select({
    message: `${server.name}`,
    options: [
      { label: "Sign in as user", value: "sign_in", hint: base_url },
      { label: "Server management", value: "server_management", hint: "Low-frequency admin access and local connection settings" },
      { label: "Back", value: "back" },
      { label: "Exit", value: "quit" },
    ],
  });

  if (!selected || isCancel(selected)) {
    return "back";
  }

  return selected as ServerEntryAction;
}
