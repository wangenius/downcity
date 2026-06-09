/**
 * 当前 City base 的 admin 工作区入口。
 *
 * 关键说明（中文）
 * - 点开某个 City 后直接进入 admin 管理，不再先展示“打开/配置 admin”中间菜单。
 * - 缺少或失效 admin key 时，才即时弹出 admin_secret_key 输入。
 * - 编辑 City、移除 City、更新 admin 访问统一收进 admin 菜单的“更多”。
 */
import { adminLoop } from "../admin/loop.js";
import { adminAuth } from "../auth/admin.js";
import { isAdminAuthError } from "../admin/auth-error.js";
import { readActiveServer, readServer, removeServer, setActiveServer, updateServer, } from "../core/session.js";
import { create_admin_tui_runtime } from "../tui/AdminTuiRuntime.js";
import { t } from "../i18n.js";
/**
 * 打开某个 server 的 admin 工作区。
 */
export async function openServerWorkspace(base_url) {
    let current_base_url = base_url;
    while (true) {
        const server = readServer(current_base_url);
        if (!server) {
            return "home";
        }
        setActiveServer(server.base_url);
        const runtime = create_admin_tui_runtime(`${server.name} - Admin`);
        const session = await resolve_admin_session(server.base_url, runtime);
        if (!session) {
            runtime.close();
            return "home";
        }
        let should_reload_workspace = false;
        try {
            const result = await adminLoop(session, {
                embedded: true,
                title: `${server.name} - Admin`,
                runtime,
                on_more: async (runtime) => {
                    const more_result = await open_city_admin_more_actions(current_base_url, runtime);
                    if (more_result.kind === "updated") {
                        current_base_url = more_result.base_url;
                        should_reload_workspace = true;
                        return "back";
                    }
                    return more_result.kind;
                },
            });
            if (result === "quit") {
                return "quit";
            }
            if (result === "logout") {
                const updated_server = await configure_admin_access_inline(current_base_url, runtime);
                if (!updated_server) {
                    runtime.close();
                    return "home";
                }
                current_base_url = updated_server.base_url;
                continue;
            }
            if (should_reload_workspace) {
                continue;
            }
            return "home";
        }
        catch (error) {
            if (!isAdminAuthError(error)) {
                throw error;
            }
            await runtime.show_message("error", t({
                zh: "Admin key 已失效，请重新输入。",
                en: "Admin key is invalid or expired. Please enter it again.",
            }));
            const updated_server = await configure_admin_access_inline(current_base_url, runtime);
            if (!updated_server) {
                runtime.close();
                return "home";
            }
            current_base_url = updated_server.base_url;
        }
    }
}
async function resolve_admin_session(base_url, runtime) {
    let server = readServer(base_url);
    if (!server) {
        return undefined;
    }
    if (!String(server.admin_secret_key ?? "").trim()) {
        const updated_server = await configure_admin_access_inline(server.base_url, runtime);
        if (!updated_server) {
            return undefined;
        }
        server = updated_server;
    }
    return await adminAuth(server);
}
async function configure_admin_access_inline(base_url, runtime) {
    const server = readServer(base_url);
    if (!server) {
        await runtime.show_message("error", t({
            zh: "所选 City 已不存在。",
            en: "Selected City no longer exists.",
        }));
        return undefined;
    }
    const admin_secret_key = await runtime.password("admin_secret_key");
    if (!admin_secret_key?.trim()) {
        return undefined;
    }
    const updated_server = updateServer(server.base_url, {
        ...server,
        admin_secret_key: admin_secret_key.trim(),
    });
    await runtime.show_message("success", t({
        zh: `Admin 访问已配置：${updated_server.name}`,
        en: `Admin access configured: ${updated_server.name}`,
    }));
    return updated_server;
}
async function open_city_admin_more_actions(base_url, runtime) {
    const server = readServer(base_url);
    if (!server) {
        return { kind: "removed" };
    }
    const selected = await runtime.select(t({
        zh: `${server.name} - 更多`,
        en: `${server.name} - More`,
    }), [
        {
            label: t({
                zh: "更新 admin 访问",
                en: "Update admin access",
            }),
            value: "update_admin",
            hint: t({
                zh: "重新输入当前 City 的 admin_secret_key",
                en: "Enter this City's admin_secret_key again",
            }),
        },
        {
            label: t({
                zh: "编辑 City",
                en: "Edit City",
            }),
            value: "edit_city",
            hint: server.base_url,
        },
        {
            label: t({
                zh: "移除 City",
                en: "Remove City",
            }),
            value: "remove_city",
            hint: t({
                zh: "删除这条本地连接记录",
                en: "Delete this local connection",
            }),
        },
        {
            label: t({
                zh: "返回",
                en: "Back",
            }),
            value: "back",
        },
        {
            label: t({
                zh: "退出",
                en: "Exit",
            }),
            value: "quit",
        },
    ]);
    if (!selected || selected === "back") {
        return { kind: "continue" };
    }
    if (selected === "quit") {
        return { kind: "quit" };
    }
    if (selected === "update_admin") {
        const admin_secret_key = await runtime.password("admin_secret_key");
        if (!admin_secret_key?.trim()) {
            return { kind: "continue" };
        }
        const updated_server = updateServer(base_url, {
            ...server,
            admin_secret_key: admin_secret_key.trim(),
        });
        await runtime.show_message("success", t({
            zh: `Admin 访问已更新：${updated_server.name}`,
            en: `Admin access updated: ${updated_server.name}`,
        }));
        return updated_server
            ? { kind: "updated", base_url: updated_server.base_url }
            : { kind: "continue" };
    }
    if (selected === "edit_city") {
        const field = await runtime.select(t({
            zh: `编辑 ${server.name}`,
            en: `Edit ${server.name}`,
        }), [
            {
                label: t({ zh: "名称", en: "Name" }),
                value: "name",
                hint: server.name,
            },
            {
                label: t({ zh: "Server URL", en: "Server URL" }),
                value: "base_url",
                hint: server.base_url,
            },
            {
                label: t({ zh: "取消", en: "Cancel" }),
                value: "cancel",
            },
        ]);
        if (!field || field === "cancel") {
            return { kind: "continue" };
        }
        const next = { ...server };
        if (field === "name") {
            const name = await runtime.text(t({ zh: "显示名称", en: "Display name" }), server.name);
            if (!name?.trim()) {
                return { kind: "continue" };
            }
            next.name = name.trim();
        }
        if (field === "base_url") {
            const next_base_url = await runtime.text("Server URL", server.base_url);
            if (!next_base_url?.trim()) {
                return { kind: "continue" };
            }
            next.base_url = next_base_url.trim();
        }
        const updated_server = updateServer(server.base_url, next);
        await runtime.show_message("success", t({
            zh: `City 已更新：${updated_server.name}`,
            en: `City updated: ${updated_server.name}`,
        }));
        return updated_server
            ? { kind: "updated", base_url: updated_server.base_url }
            : { kind: "continue" };
    }
    if (selected === "remove_city") {
        const confirmed = await runtime.select(t({
            zh: `移除 ${server.name}?`,
            en: `Remove ${server.name}?`,
        }), [
            {
                label: t({ zh: "确认移除", en: "Remove" }),
                value: "remove",
                hint: server.base_url,
            },
            {
                label: t({ zh: "取消", en: "Cancel" }),
                value: "cancel",
            },
        ]);
        if (confirmed !== "remove") {
            return { kind: "continue" };
        }
        removeServer(base_url);
        const next_active = readActiveServer();
        await runtime.show_message("success", next_active
            ? t({
                zh: `City 已移除。当前 City：${next_active.name}`,
                en: `City removed. Current City: ${next_active.name}`,
            })
            : t({
                zh: "City 已移除。当前没有已配置的 City。",
                en: "City removed. No City configured.",
            }));
        return { kind: "removed" };
    }
    return { kind: "continue" };
}
//# sourceMappingURL=ServerWorkspace.js.map