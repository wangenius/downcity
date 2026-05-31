/**
 * Admin Towns 管理命令。
 */

import { City } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { askText, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageTowns(city: City): Promise<void> {
  while (true) {
    const act = await select({
      message: "Towns",
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
        const items = await city.towns.list();
        console.log(`\n${items.length} towns:\n`);
        for (const town of items) {
          console.log(`  ${town.town_id.padEnd(24)} ${town.name.padEnd(20)} [${town.status}]`);
        }
        console.log("");
      } else if (act === "create") {
        const name = await askText("town name");
        if (!name) continue;
        const town_id = await askText("town_id (optional)");
        const town = await city.towns.create(
          town_id
            ? { name, town_id }
            : { name },
        );
        showSuccess(`created: ${town.town_id}`);
      } else if (act === "pause") {
        const id = await askText("town_id");
        if (!id) continue;
        await city.towns.pause(id);
        showSuccess(`paused: ${id}`);
      } else if (act === "activate") {
        const id = await askText("town_id");
        if (!id) continue;
        await city.towns.activate(id);
        showSuccess(`activated: ${id}`);
      } else if (act === "remove") {
        const id = await askText("town_id");
        if (!id) continue;
        await city.towns.remove(id);
        showSuccess(`removed: ${id}`);
      } else if (act === "token") {
        const town_id = await askText("town_id");
        if (!town_id) continue;
        const user_id = await askText("user_id");
        if (!user_id) continue;
        const token = await city.towns.tokens.apply({ town_id, user_id });
        showSuccess(`token: ${token.user_token.slice(0, 20)}...`);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
