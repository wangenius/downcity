/**
 * Admin Accounts 管理命令。
 */

import { City } from "@downcity/city";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageAccounts(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  const svc = a.service("accounts");
  while (true) {
    const act = await runtime.select("Accounts", [
        { label: "List users", value: "users" },
        { label: "List sessions", value: "sessions" },
        { label: "Back", value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "users") {
        const b = await runtime.with_loading("Users", async () => await svc.get<{ items: { user_id: string; email: string; created_at: string }[] }>("users"));
        await runtime.show_table({
          title: `${b.items.length} Users`,
          columns: ["User ID", "Email", "Created"],
          rows: b.items.map((u) => ({
            cells: [u.user_id, u.email, u.created_at.slice(0, 10)],
          })),
          empty_message: "No users.",
        });
      } else {
        const b = await runtime.with_loading("Sessions", async () => await svc.get<{ items: { session_id: string; user_id: string; status: string }[] }>("sessions"));
        await runtime.show_table({
          title: `${b.items.length} Sessions`,
          columns: ["Session ID", "User ID", "Status"],
          rows: b.items.map((s) => ({
            cells: [s.session_id, s.user_id, s.status],
          })),
          empty_message: "No sessions.",
        });
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
