/**
 * Admin Products 管理命令。
 */

import { AdminClient } from "@downcity/conduit";
import { select, isCancel } from "@clack/prompts";
import { askText, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageProducts(a: AdminClient): Promise<void> {
  while (true) {
    const act = await select({
      message: "Products",
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
        const items = await a.products.list();
        console.log(`\n${items.length} products:\n`);
        for (const p of items) {
          console.log(`  ${p.product_id.padEnd(24)} ${p.name.padEnd(20)} [${p.status}]`);
        }
        console.log("");
      } else if (act === "create") {
        const n = await askText("product name");
        if (!n) continue;
        const productId = await askText("product_id (optional)");
        const p = await a.products.create(
          productId
            ? { name: n, product_id: productId }
            : { name: n },
        );
        showSuccess(`created: ${p.product_id}`);
      } else if (act === "pause") {
        const id = await askText("product_id");
        if (!id) continue;
        await a.products.pause(id);
        showSuccess(`paused: ${id}`);
      } else if (act === "activate") {
        const id = await askText("product_id");
        if (!id) continue;
        await a.products.activate(id);
        showSuccess(`activated: ${id}`);
      } else if (act === "remove") {
        const id = await askText("product_id");
        if (!id) continue;
        await a.products.remove(id);
        showSuccess(`removed: ${id}`);
      } else if (act === "token") {
        const pid = await askText("product_id");
        if (!pid) continue;
        const uid = await askText("user_id");
        if (!uid) continue;
        const t = await a.products.tokens.apply({ product_id: pid, user_id: uid });
        showSuccess(`token: ${t.user_token.slice(0, 20)}...`);
      }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
