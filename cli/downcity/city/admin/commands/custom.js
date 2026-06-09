/**
 * Admin Custom Service 命令。
 */
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
export async function manageCustom(a, _baseUrl, runtime) {
    while (true) {
        const name = await runtime.text("service name (empty to go back)");
        if (!name)
            return;
        const act = await runtime.select(name, [
            { label: "GET", value: "get" },
            { label: "POST", value: "post" },
            { label: "Back", value: "back" },
        ]);
        if (!act || act === "back")
            return;
        try {
            const svc = a.service(name);
            if (act === "get") {
                const path = await runtime.text("path") ?? "";
                const result = await runtime.with_loading(`${name} GET`, async () => await svc.get(path));
                await runtime.show_json(`${name} GET ${path || "/"}`, result);
            }
            else {
                const raw = await runtime.text("body (JSON)") ?? "{}";
                let body;
                try {
                    body = JSON.parse(raw);
                }
                catch {
                    await runtime.show_message("error", "Invalid JSON body");
                    continue;
                }
                const result = await runtime.with_loading(`${name} POST`, async () => await svc.action("").invoke(body));
                await runtime.show_json(`${name} POST`, result);
            }
        }
        catch (e) {
            rethrowAdminAuthError(e);
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
//# sourceMappingURL=custom.js.map