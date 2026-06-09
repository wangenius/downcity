/**
 * Admin Towns 管理命令。
 */

import { City } from "@downcity/city";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageTowns(city: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  while (true) {
    const act = await runtime.select("Towns", [
        { label: "List all", value: "list" },
        { label: "Create", value: "create" },
        { label: "Pause", value: "pause" },
        { label: "Activate", value: "activate" },
        { label: "Remove", value: "remove" },
        { label: "Issue token", value: "token" },
        { label: "Back", value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "list") {
        const items = await runtime.with_loading("Towns", async () => await city.towns.list());
        await runtime.show_table({
          title: `${items.length} Towns`,
          columns: ["Town ID", "Name", "Status"],
          rows: items.map((town) => ({
            cells: [town.town_id, town.name, town.status],
          })),
          empty_message: "No towns.",
        });
      } else if (act === "create") {
        const name = await runtime.text("town name");
        if (!name) continue;
        const town_id = await runtime.text("town_id (optional)");
        const town = await runtime.with_loading("Create Town", async () => await city.towns.create(
          town_id
            ? { name, town_id }
            : { name },
        ));
        await runtime.show_message("success", `created: ${town.town_id}`);
      } else if (act === "pause") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading("Pause Town", async () => await city.towns.pause(id));
        await runtime.show_message("success", `paused: ${id}`);
      } else if (act === "activate") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading("Activate Town", async () => await city.towns.activate(id));
        await runtime.show_message("success", `activated: ${id}`);
      } else if (act === "remove") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading("Remove Town", async () => await city.towns.remove(id));
        await runtime.show_message("success", `removed: ${id}`);
      } else if (act === "token") {
        const town_id = await runtime.text("town_id");
        if (!town_id) continue;
        const user_id = await runtime.text("user_id");
        if (!user_id) continue;
        const token = await runtime.with_loading("Issue Token", async () => await city.towns.tokens.apply({ town_id, user_id }));
        await runtime.show_text("Town Token", token.user_token);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
