/**
 * Admin Accounts 管理命令。
 */

import { AdminClient } from "@downcity/gate";
import { select, isCancel } from "@clack/prompts";
import { showError } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageAccounts(a: AdminClient): Promise<void> {
  const svc = a.service("accounts");
  while (true) {
    const act = await select({
      message: "Accounts",
      options: [
        { label: "List users", value: "users" },
        { label: "List sessions", value: "sessions" },
        { label: "Back", value: "back" },
      ],
    });
    if (!act || isCancel(act) || act === "back") return;

    try {
      if (act === "users") {
        const b = await svc.get<{ items: { user_id: string; email: string; created_at: string }[] }>("users");
        console.log(`\n${b.items.length} users:\n`);
        for (const u of b.items) {
          console.log(`  ${u.user_id.padEnd(30)} ${u.email.padEnd(30)} ${u.created_at.slice(0, 10)}`);
        }
        console.log("");
      } else {
        const b = await svc.get<{ items: { session_id: string; user_id: string; status: string }[] }>("sessions");
        console.log(`\n${b.items.length} sessions:\n`);
        for (const s of b.items) {
          console.log(`  ${s.session_id.padEnd(36)} ${s.user_id.padEnd(30)} [${s.status}]`);
        }
        console.log("");
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
