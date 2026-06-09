/**
 * Admin Env 管理命令。
 *
 * 三种模式：
 * - Init：遍历所有 service 的 env 需求，逐一交互式配置
 * - 按 Service 查看：选择一个 service，查看/配置其 env
 * - 直接管理：list / upsert / remove 裸 key-value
 */
import { adminErrorMessage, isAdminNotFoundError, rethrowAdminAuthError } from "../auth-error.js";
export async function manageEnv(a, _baseUrl, runtime) {
    while (true) {
        const services = await fetchEnvScopes(a, runtime);
        const choices = [
            { label: "Init (walk through all)", value: "__init__", hint: "Configure all missing env keys in sequence" },
            { label: "List all", value: "__list__", hint: "Show all configured env variables" },
            { label: "Upsert", value: "__upsert__", hint: "Add or update a key=value" },
            { label: "Update", value: "__update__", hint: "Update an existing key" },
            { label: "Remove", value: "__remove__", hint: "Delete a key" },
            { label: "Refresh runtime cache", value: "__refresh__", hint: "Reload env cache after direct database edits" },
        ];
        if (services) {
            for (const s of services) {
                const configured = s.env.filter((item) => item.configured).length;
                choices.push({
                    label: `  ${s.name} (${configured}/${s.env.length} configured)`,
                    value: s.id,
                    hint: s.env.map((e) => `${e.key}${e.configured ? "✓" : ""}`).join(", "),
                });
            }
        }
        choices.push({ label: "Back", value: "back", hint: "Return to admin menu" });
        const svcId = await runtime.select("Env", choices);
        if (!svcId || svcId === "back")
            return;
        if (svcId === "__init__" && services) {
            await initAllEnv(a, services, runtime);
            continue;
        }
        if (svcId === "__list__") {
            await listAllEnv(a, runtime);
            continue;
        }
        if (svcId === "__upsert__") {
            await upsertEnv(a, runtime);
            continue;
        }
        if (svcId === "__update__") {
            await updateEnv(a, runtime);
            continue;
        }
        if (svcId === "__remove__") {
            await removeEnv(a, runtime);
            continue;
        }
        if (svcId === "__refresh__") {
            await refreshEnv(a, runtime);
            continue;
        }
        if (services) {
            const svc = services.find((s) => s.id === svcId);
            if (svc)
                await configureServiceEnv(a, svc, runtime);
        }
    }
}
// ============================================================
// Init 模式
// ============================================================
async function initAllEnv(a, services, runtime) {
    const configuredKeys = new Set(services.flatMap((svc) => svc.env.filter((item) => item.configured).map((item) => item.key)));
    let changed = false;
    const lines = [];
    for (const svc of services) {
        lines.push(`── ${svc.name} ──────────────────────────────`);
        for (const req of svc.env) {
            if (configuredKeys.has(req.key)) {
                lines.push(`  ${req.key} ✓ already set`);
                continue;
            }
            const label = req.required
                ? `${req.key} (${req.description})`
                : `${req.key} (${req.description}, optional — enter to skip)`;
            const value = await runtime.text(label);
            if (!value) {
                if (req.required) {
                    lines.push(`  ${req.key} ✗ skipped (required)`);
                }
                continue;
            }
            try {
                await runtime.with_loading(`Set ${req.key}`, async () => await a.env.upsert({ key: req.key, value }));
                configuredKeys.add(req.key);
                lines.push(`  ${req.key} ✓ set`);
                changed = true;
            }
            catch (e) {
                rethrowAdminAuthError(e);
                lines.push(`  ${req.key} ✗ ${adminErrorMessage(e)}`);
            }
        }
    }
    lines.push("");
    lines.push(changed ? "Env init complete." : "All env keys are already configured.");
    await runtime.show_text("Env Init", lines.join("\n"));
}
// ============================================================
// 直接管理模式
// ============================================================
async function listAllEnv(a, runtime) {
    try {
        const items = await runtime.with_loading("Env", async () => await a.env.list());
        await runtime.show_table({
            title: `${items.length} Env`,
            columns: ["Key", "Value"],
            rows: items.map((item) => ({
                cells: [item.key, maskValue(item.value, 40)],
            })),
            empty_message: "No env variables configured.",
        });
    }
    catch (e) {
        rethrowAdminAuthError(e);
        await runtime.show_message("error", adminErrorMessage(e));
    }
}
async function upsertEnv(a, runtime) {
    const key = await runtime.text("key");
    if (!key)
        return;
    const value = await runtime.text("value");
    if (!value)
        return;
    try {
        await runtime.with_loading(`Upsert ${key}`, async () => await a.env.upsert({ key, value }));
        await runtime.show_message("success", `upserted: ${key}`);
    }
    catch (e) {
        rethrowAdminAuthError(e);
        await runtime.show_message("error", adminErrorMessage(e));
    }
}
async function updateEnv(a, runtime) {
    const items = await fetchCurrentEnv(a);
    if (items.length === 0) {
        await runtime.show_message("info", "No env variables to update.");
        return;
    }
    const choices = items.map((e) => ({
        label: e.key, value: e.key, hint: `current: ${maskValue(e.value, 20)}`,
    }));
    choices.push({ label: "Cancel", value: "__cancel__", hint: "Return without changes" });
    const key = await runtime.select("Select key to update", choices);
    if (!key || key === "__cancel__")
        return;
    const current = items.find((e) => e.key === key);
    const value = await runtime.text(`New value (current: ${maskValue(current.value, 16)})`);
    if (!value)
        return;
    try {
        await runtime.with_loading(`Update ${String(key)}`, async () => await a.env.upsert({ key: key, value }));
        await runtime.show_message("success", `updated: ${key}`);
    }
    catch (e) {
        rethrowAdminAuthError(e);
        await runtime.show_message("error", adminErrorMessage(e));
    }
}
async function removeEnv(a, runtime) {
    const key = await runtime.text("key");
    if (!key)
        return;
    try {
        await runtime.with_loading(`Remove ${key}`, async () => await a.env.remove(key));
        await runtime.show_message("success", `removed: ${key}`);
    }
    catch (e) {
        rethrowAdminAuthError(e);
        await runtime.show_message("error", adminErrorMessage(e));
    }
}
async function refreshEnv(a, runtime) {
    try {
        const result = await runtime.with_loading("Refresh Env", async () => await a.env.refresh());
        await runtime.show_message("success", `env runtime cache refreshed (${result.count} keys)`);
    }
    catch (e) {
        rethrowAdminAuthError(e);
        await runtime.show_message("error", adminErrorMessage(e));
    }
}
// ============================================================
// 按 Service 查看
// ============================================================
async function configureServiceEnv(a, svc, runtime) {
    while (true) {
        const scopes = await fetchEnvScopes(a, runtime);
        const currentScope = scopes?.find((item) => item.id === svc.id) ?? svc;
        const choices = currentScope.env.map((req) => {
            const status = req.configured
                ? `✓ configured${req.value_preview ? ` (${req.value_preview})` : ""}`
                : (req.required ? "✗ MISSING" : "○ unset");
            return { label: req.key, value: req.key, hint: `${req.description} [${status}]` };
        });
        choices.push({ label: "Back", value: "back", hint: "Return to env menu" });
        const key = await runtime.select(`${svc.name} — configure`, choices);
        if (!key || key === "back")
            return;
        const req = currentScope.env.find((e) => e.key === key);
        const hint = req.configured
            ? `(current: ${req.value_preview ?? "configured"}, enter a new value to replace it)`
            : "";
        const value = await runtime.text(`${req.description} ${hint}`);
        if (!value)
            continue;
        try {
            if (value) {
                await runtime.with_loading(`Set ${req.key}`, async () => await a.env.upsert({ key: req.key, value }));
                await runtime.show_message("success", `set ${req.key}`);
            }
        }
        catch (e) {
            rethrowAdminAuthError(e);
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
// ============================================================
// 工具
// ============================================================
async function fetchEnvScopes(a, runtime) {
    try {
        const scopes = await runtime.with_loading("Env Catalog", async () => await a.env.catalog());
        if (scopes.length === 0) {
            await runtime.show_message("info", "No services or AI models with env requirements found.");
            return undefined;
        }
        return scopes;
    }
    catch (e) {
        rethrowAdminAuthError(e);
        if (isAdminNotFoundError(e)) {
            await runtime.show_message("error", "Connected City is too old and does not expose /v1/env/catalog yet. Deploy the latest worker/server first.");
            return undefined;
        }
        await runtime.show_message("error", `Failed to fetch env catalog: ${adminErrorMessage(e)}`);
        return undefined;
    }
}
async function fetchCurrentEnv(a) {
    try {
        return await a.env.list();
    }
    catch (e) {
        rethrowAdminAuthError(e);
        return [];
    }
}
function maskValue(v, n) {
    return v.length <= n ? v : v.slice(0, n) + "...";
}
//# sourceMappingURL=service-env.js.map