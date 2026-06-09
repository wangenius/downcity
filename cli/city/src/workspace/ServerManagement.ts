/**
 * 当前 City server 的 admin 管理入口。
 *
 * 关键说明（中文）
 * - `city` CLI 只暴露 admin/base 管理能力。
 * - user 登录与 user runtime 由 `town` 管理。
 */

import { isCancel, select } from "../tui/Prompts.js";
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
import { t } from "../i18n.js";

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
      showError(t({
        zh: "当前 City 已不存在。",
        en: "Current City no longer exists.",
      }));
      return "back";
    }

    const has_admin_access = !!String(server.admin_secret_key ?? "").trim();

    const selected = await select({
      message: t({
        zh: `${server.name} - Server 管理`,
        en: `${server.name} - Server management`,
      }),
      options: [
        has_admin_access
          ? {
            label: t({
              zh: "打开 admin 工具",
              en: "Open admin tools",
            }),
            value: "open_admin",
            hint: t({
              zh: "环境变量、账户、towns、usage、payment 等管理能力",
              en: "Environment, accounts, towns, usage, payment and more",
            }),
          }
          : {
            label: t({
              zh: "配置 admin 访问",
              en: "Configure admin access",
            }),
            value: "configure_admin",
            hint: t({
              zh: "为当前 City 设置 admin_secret_key",
              en: "Set admin_secret_key for this City",
            }),
          },
        ...(has_admin_access
          ? [{
            label: t({
              zh: "更新 admin 访问",
              en: "Update admin access",
            }),
            value: "configure_admin",
            hint: t({
              zh: "替换当前 admin_secret_key",
              en: "Replace the current admin_secret_key",
            }),
          }]
          : []),
        {
          label: t({
            zh: "编辑 City",
            en: "Edit City",
          }),
          value: "edit_server",
          hint: server.base_url,
        },
        {
          label: t({
            zh: "移除 City",
            en: "Remove City",
          }),
          value: "remove_server",
          hint: t({
            zh: "删除这条本地连接记录",
            en: "Delete this local connection",
          }),
        },
        {
          label: t({
            zh: "返回",
            en: "Back",
          }),
          value: "back",
        },
        {
          label: t({
            zh: "退出",
            en: "Exit",
          }),
          value: "quit",
        },
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
