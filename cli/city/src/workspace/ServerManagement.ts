/**
 * 当前 City server 的 admin 管理入口。
 *
 * 关键说明（中文）
 * - `city` CLI 只暴露 admin/base 管理能力。
 * - user 登录与 user runtime 由 `town` 管理。
 */

import { isCancel, select } from "@clack/prompts";
import { adminAuth } from "../auth/admin.js";
import {
  promptConfigureAdminAccess,
  promptEditServer,
  promptRemoveServer,
} from "../auth/server-switch.js";
import { readServer } from "../core/session.js";
import { showError } from "../core/ui.js";
import { type ServerManagementResult } from "../types/Interactive.js";
import { adminLoop } from "../admin/loop.js";

/**
 * 打开某个 server 的管理菜单。
 */
export async function openServerManagement(
  base_url: string,
): Promise<ServerManagementResult> {
  let current_base_url = base_url;

  while (true) {
    const server = readServer(current_base_url);
    if (!server) {
      showError("Current City no longer exists.");
      return "back";
    }

    const has_admin_access = !!String(server.admin_secret_key ?? "").trim();

    const selected = await select({
      message: `${server.name} - Server management`,
      options: [
        has_admin_access
          ? {
            label: "Open admin tools",
            value: "open_admin",
            hint: "Environment, accounts, towns, usage, payment and more",
          }
          : {
            label: "Configure admin access",
            value: "configure_admin",
            hint: "Set admin_secret_key for this City",
          },
        ...(has_admin_access
          ? [{
            label: "Update admin access",
            value: "configure_admin",
            hint: "Replace the current admin_secret_key",
          }]
          : []),
        {
          label: "Edit City",
          value: "edit_server",
          hint: server.base_url,
        },
        {
          label: "Remove City",
          value: "remove_server",
          hint: "Delete this local connection",
        },
        { label: "Back", value: "back" },
        { label: "Exit", value: "quit" },
      ],
    });

    if (!selected || isCancel(selected) || selected === "back") {
      return "back";
    }

    if (selected === "quit") {
      return "quit";
    }

    if (selected === "configure_admin") {
      const updated_server = await promptConfigureAdminAccess(current_base_url);
      if (updated_server) {
        current_base_url = updated_server.base_url;
      }
      continue;
    }

    if (selected === "edit_server") {
      const updated_server = await promptEditServer(current_base_url);
      if (updated_server) {
        current_base_url = updated_server.base_url;
      }
      continue;
    }

    if (selected === "remove_server") {
      const removed = await promptRemoveServer(current_base_url);
      if (removed) {
        return "back";
      }
      continue;
    }

    const session = await adminAuth(server);
    if (!session) {
      continue;
    }

    const result = await adminLoop(session, { embedded: true });
    if (result === "quit") {
      return "quit";
    }
  }
}
