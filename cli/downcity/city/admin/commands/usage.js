/**
 * Admin Usage 管理命令。
 */
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
export async function manageUsage(a, _baseUrl, runtime) {
    const svc = a.service("usage");
    while (true) {
        const act = await runtime.select("Usage", [
            { label: "List events", value: "events" },
            { label: "Summary", value: "summary" },
            { label: "Back", value: "back" },
        ]);
        if (!act || act === "back")
            return;
        try {
            if (act === "events") {
                const b = await runtime.with_loading("Usage Events", async () => await svc.get("events"));
                const items = b.items.slice(-20);
                await runtime.show_table({
                    title: `${items.length} Usage Events`,
                    columns: ["Created", "Town", "Service", "Status"],
                    rows: items.map((e) => ({
                        cells: [e.created_at.slice(0, 19), e.town_id, e.service, e.status],
                    })),
                    empty_message: "No usage events.",
                });
            }
            else {
                const b = await runtime.with_loading("Usage Summary", async () => await svc.get("summary"));
                await runtime.show_table({
                    title: "Usage Summary",
                    columns: ["Town", "Service", "Count", "Status"],
                    rows: b.items.map((s) => ({
                        cells: [s.town_id, s.service, String(s.count), s.status],
                    })),
                    empty_message: "No usage summary.",
                });
            }
        }
        catch (e) {
            rethrowAdminAuthError(e);
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
//# sourceMappingURL=usage.js.map