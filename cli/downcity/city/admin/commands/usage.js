/**
 * Admin Usage 管理命令。
 */
import { select, isCancel } from "../../tui/Prompts.js";
import { showError } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
export async function manageUsage(a) {
    const svc = a.service("usage");
    while (true) {
        const act = await select({
            message: "Usage",
            options: [
                { label: "List events", value: "events" },
                { label: "Summary", value: "summary" },
                { label: "Back", value: "back" },
            ],
        });
        if (!act || isCancel(act) || act === "back")
            return;
        try {
            if (act === "events") {
                const b = await svc.get("events");
                console.log(`\n${b.items.length} events:\n`);
                for (const e of b.items.slice(-20)) {
                    console.log(`  ${e.created_at.slice(0, 19)}  ${e.town_id.padEnd(22)} ${e.service.padEnd(15)} [${e.status}]`);
                }
                console.log("");
            }
            else {
                const b = await svc.get("summary");
                console.log(`\nSummary:\n`);
                for (const s of b.items) {
                    console.log(`  ${s.town_id.padEnd(22)} ${s.service.padEnd(15)} ${String(s.count).padStart(5)} [${s.status}]`);
                }
                console.log("");
            }
        }
        catch (e) {
            rethrowAdminAuthError(e);
            showError(adminErrorMessage(e));
        }
    }
}
//# sourceMappingURL=usage.js.map