/**
 * Admin Towns 管理命令。
 */

import { City } from "@downcity/city";
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageTowns(city: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  while (true) {
    const act = await runtime.select("Towns", [
        { label: t({ zh: "查看全部", en: "List all" }), value: "list" },
        { label: t({ zh: "创建", en: "Create" }), value: "create" },
        { label: t({ zh: "暂停", en: "Pause" }), value: "pause" },
        { label: t({ zh: "启用", en: "Activate" }), value: "activate" },
        { label: t({ zh: "移除", en: "Remove" }), value: "remove" },
        { label: t({ zh: "签发 token", en: "Issue token" }), value: "token" },
        { label: t({ zh: "返回", en: "Back" }), value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "list") {
        const items = await runtime.with_loading("Towns", async () => await city.towns.list());
        await runtime.show_table({
          title: t({ zh: `${items.length} 个 Town`, en: `${items.length} Towns` }),
          columns: ["Town ID", t({ zh: "名称", en: "Name" }), t({ zh: "状态", en: "Status" })],
          rows: items.map((town) => ({
            cells: [town.town_id, town.name, town.status],
          })),
          empty_message: t({ zh: "暂无 Town。", en: "No towns." }),
        });
      } else if (act === "create") {
        const name = await runtime.text(t({ zh: "town 名称", en: "town name" }));
        if (!name) continue;
        const town_id = await runtime.text("town_id (optional)");
        const town = await runtime.with_loading(t({ zh: "创建 Town", en: "Create Town" }), async () => await city.towns.create(
          town_id
            ? { name, town_id }
            : { name },
        ));
        await runtime.show_message("success", t({ zh: `已创建：${town.town_id}`, en: `created: ${town.town_id}` }));
      } else if (act === "pause") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading(t({ zh: "暂停 Town", en: "Pause Town" }), async () => await city.towns.pause(id));
        await runtime.show_message("success", t({ zh: `已暂停：${id}`, en: `paused: ${id}` }));
      } else if (act === "activate") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading(t({ zh: "启用 Town", en: "Activate Town" }), async () => await city.towns.activate(id));
        await runtime.show_message("success", t({ zh: `已启用：${id}`, en: `activated: ${id}` }));
      } else if (act === "remove") {
        const id = await runtime.text("town_id");
        if (!id) continue;
        await runtime.with_loading(t({ zh: "移除 Town", en: "Remove Town" }), async () => await city.towns.remove(id));
        await runtime.show_message("success", t({ zh: `已移除：${id}`, en: `removed: ${id}` }));
      } else if (act === "token") {
        const town_id = await runtime.text("town_id");
        if (!town_id) continue;
        const user_id = await runtime.text("user_id");
        if (!user_id) continue;
        const token = await runtime.with_loading(t({ zh: "签发 Token", en: "Issue Token" }), async () => await city.towns.tokens.apply({ town_id, user_id }));
        await runtime.show_text("Town Token", token.user_token);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
