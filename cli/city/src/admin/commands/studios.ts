/**
 * Admin Studios 管理命令。
 */

import { Gate } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { askText, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageStudios(a: Gate): Promise<void> {
  while (true) {
    const act = await select({
      message: "Studios",
      options: [
        { label: "List all", value: "list" },
        { label: "Create", value: "create" },
        { label: "Pause", value: "pause" },
        { label: "Activate", value: "activate" },
        { label: "Remove", value: "remove" },
        { label: "Issue token", value: "token" },
        { label: "Back", value: "back" },
      ],
    });
    if (!act || isCancel(act) || act === "back") return;

    try {
      if (act === "list") {
        const items = await a.studios.list();
        console.log(`\n${items.length} studios:\n`);
        for (const studio of items) {
          console.log(`  ${studio.studio_id.padEnd(24)} ${studio.name.padEnd(20)} [${studio.status}]`);
        }
        console.log("");
      } else if (act === "create") {
        const n = await askText("studio name");
        if (!n) continue;
        const studio_id = await askText("studio_id (optional)");
        const studio = await a.studios.create(
          studio_id
            ? { name: n, studio_id }
            : { name: n },
        );
        showSuccess(`created: ${studio.studio_id}`);
      } else if (act === "pause") {
        const id = await askText("studio_id");
        if (!id) continue;
        await a.studios.pause(id);
        showSuccess(`paused: ${id}`);
      } else if (act === "activate") {
        const id = await askText("studio_id");
        if (!id) continue;
        await a.studios.activate(id);
        showSuccess(`activated: ${id}`);
      } else if (act === "remove") {
        const id = await askText("studio_id");
        if (!id) continue;
        await a.studios.remove(id);
        showSuccess(`removed: ${id}`);
      } else if (act === "token") {
        const studio_id = await askText("studio_id");
        if (!studio_id) continue;
        const uid = await askText("user_id");
        if (!uid) continue;
        const t = await a.studios.tokens.apply({ studio_id, user_id: uid });
        showSuccess(`token: ${t.user_token.slice(0, 20)}...`);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
