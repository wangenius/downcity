/**
 * Admin Usage 管理命令。
 */

import { City } from "@downcity/city";
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageUsage(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  const svc = a.service("usage");
  while (true) {
    const act = await runtime.select("Usage", [
        { label: t({ zh: "查看事件", en: "List events" }), value: "events" },
        { label: t({ zh: "汇总", en: "Summary" }), value: "summary" },
        { label: t({ zh: "返回", en: "Back" }), value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "events") {
        const b = await runtime.with_loading(t({ zh: "用量事件", en: "Usage Events" }), async () => await svc.get<{ items: { town_id: string; service: string; status: string; created_at: string }[] }>("events"));
        const items = b.items.slice(-20);
        await runtime.show_table({
          title: t({ zh: `${items.length} 条用量事件`, en: `${items.length} Usage Events` }),
          columns: [t({ zh: "创建时间", en: "Created" }), "Town", t({ zh: "服务", en: "Service" }), t({ zh: "状态", en: "Status" })],
          rows: items.map((e) => ({
            cells: [e.created_at.slice(0, 19), e.town_id, e.service, e.status],
          })),
          empty_message: t({ zh: "暂无用量事件。", en: "No usage events." }),
        });
      } else {
        const b = await runtime.with_loading(t({ zh: "用量汇总", en: "Usage Summary" }), async () => await svc.get<{ items: { town_id: string; service: string; status: string; count: number }[] }>("summary"));
        await runtime.show_table({
          title: t({ zh: "用量汇总", en: "Usage Summary" }),
          columns: ["Town", t({ zh: "服务", en: "Service" }), t({ zh: "数量", en: "Count" }), t({ zh: "状态", en: "Status" })],
          rows: b.items.map((s) => ({
            cells: [s.town_id, s.service, String(s.count), s.status],
          })),
          empty_message: t({ zh: "暂无用量汇总。", en: "No usage summary." }),
        });
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
