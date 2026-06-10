/**
 * Admin Custom Service 命令。
 */

import { City } from "@downcity/city";
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageCustom(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  while (true) {
    const name = await runtime.text(t({
      zh: "服务名称（留空返回）",
      en: "service name (empty to go back)",
    }));
    if (!name) return;

    const act = await runtime.select(name, [
        { label: "GET", value: "get" },
        { label: "POST", value: "post" },
        { label: t({ zh: "返回", en: "Back" }), value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      const svc = a.service(name);
      if (act === "get") {
        const path = await runtime.text("path") ?? "";
        const result = await runtime.with_loading(`${name} GET`, async () => await svc.get(path));
        await runtime.show_json(`${name} GET ${path || "/"}`, result);
      } else {
        const raw = await runtime.text("body (JSON)") ?? "{}";
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw);
        } catch {
          await runtime.show_message("error", t({
            zh: "JSON body 无效",
            en: "Invalid JSON body",
          }));
          continue;
        }
        const result = await runtime.with_loading(`${name} POST`, async () => await svc.action("").invoke(body));
        await runtime.show_json(`${name} POST`, result);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
