/**
 * Admin Bays 管理命令。
 */

import { Visa } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { askText, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageBays(visa: Visa): Promise<void> {
  while (true) {
    const act = await select({
      message: "Bays",
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
        const items = await visa.bays.list();
        console.log(`\n${items.length} bays:\n`);
        for (const bay of items) {
          console.log(`  ${bay.bay_id.padEnd(24)} ${bay.name.padEnd(20)} [${bay.status}]`);
        }
        console.log("");
      } else if (act === "create") {
        const name = await askText("bay name");
        if (!name) continue;
        const bay_id = await askText("bay_id (optional)");
        const bay = await visa.bays.create(
          bay_id
            ? { name, bay_id }
            : { name },
        );
        showSuccess(`created: ${bay.bay_id}`);
      } else if (act === "pause") {
        const id = await askText("bay_id");
        if (!id) continue;
        await visa.bays.pause(id);
        showSuccess(`paused: ${id}`);
      } else if (act === "activate") {
        const id = await askText("bay_id");
        if (!id) continue;
        await visa.bays.activate(id);
        showSuccess(`activated: ${id}`);
      } else if (act === "remove") {
        const id = await askText("bay_id");
        if (!id) continue;
        await visa.bays.remove(id);
        showSuccess(`removed: ${id}`);
      } else if (act === "token") {
        const bay_id = await askText("bay_id");
        if (!bay_id) continue;
        const user_id = await askText("user_id");
        if (!user_id) continue;
        const token = await visa.bays.tokens.apply({ bay_id, user_id });
        showSuccess(`token: ${token.user_token.slice(0, 20)}...`);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
