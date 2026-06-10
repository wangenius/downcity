/**
 * Admin Accounts 管理命令。
 */

import { City } from "@downcity/city";
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageAccounts(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  const svc = a.service("accounts");
  while (true) {
    const act = await runtime.select("Accounts", [
        { label: t({ zh: "查看用户", en: "List users" }), value: "users" },
        { label: t({ zh: "查看会话", en: "List sessions" }), value: "sessions" },
        { label: t({ zh: "返回", en: "Back" }), value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "users") {
        const b = await runtime.with_loading(t({ zh: "用户", en: "Users" }), async () => await svc.get<{ items: { user_id: string; email: string; created_at: string }[] }>("users"));
        await runtime.show_table({
          title: t({ zh: `${b.items.length} 个用户`, en: `${b.items.length} Users` }),
          columns: [t({ zh: "用户 ID", en: "User ID" }), t({ zh: "邮箱", en: "Email" }), t({ zh: "创建时间", en: "Created" })],
          rows: b.items.map((u) => ({
            cells: [u.user_id, u.email, u.created_at.slice(0, 10)],
          })),
          empty_message: t({ zh: "暂无用户。", en: "No users." }),
        });
      } else {
        const b = await runtime.with_loading(t({ zh: "会话", en: "Sessions" }), async () => await svc.get<{ items: { session_id: string; user_id: string; status: string }[] }>("sessions"));
        await runtime.show_table({
          title: t({ zh: `${b.items.length} 个会话`, en: `${b.items.length} Sessions` }),
          columns: [t({ zh: "会话 ID", en: "Session ID" }), t({ zh: "用户 ID", en: "User ID" }), t({ zh: "状态", en: "Status" })],
          rows: b.items.map((s) => ({
            cells: [s.session_id, s.user_id, s.status],
          })),
          empty_message: t({ zh: "暂无会话。", en: "No sessions." }),
        });
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
