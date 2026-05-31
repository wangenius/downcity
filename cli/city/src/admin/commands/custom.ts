/**
 * Admin Custom Service 命令。
 */

import { Gate } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { askText, showError } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageCustom(a: Gate): Promise<void> {
  while (true) {
    const name = await askText("service name (empty to go back)");
    if (!name) return;

    const act = await select({
      message: name,
      options: [
        { label: "GET", value: "get" },
        { label: "POST", value: "post" },
        { label: "Back", value: "back" },
      ],
    });
    if (!act || isCancel(act) || act === "back") return;

    try {
      const svc = a.service(name);
      if (act === "get") {
        const path = await askText("path") ?? "";
        console.log(JSON.stringify(await svc.get(path), null, 2));
      } else {
        const raw = await askText("body (JSON)") ?? "{}";
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw);
        } catch {
          showError("Invalid JSON body");
          continue;
        }
        console.log(JSON.stringify(await svc.action("").invoke(body), null, 2));
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
