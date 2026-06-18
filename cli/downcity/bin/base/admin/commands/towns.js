/**
 * Admin Towns 管理命令。
 */
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
export async function manageTowns(city, _baseUrl, runtime) {
    while (true) {
        const act = await runtime.select(t({ zh: "产品管理", en: "Products" }), [
            {
                label: t({ zh: "查看全部", en: "List all" }),
                value: "list",
                hint: t({
                    zh: "查看全部产品/App 入口及其 Town ID、名称和启用状态。",
                    en: "List all product/App entries with Town ID, name, and status.",
                }),
            },
            {
                label: t({ zh: "创建产品", en: "Create product" }),
                value: "create",
                hint: t({
                    zh: "创建一个新的产品/App 入口；它会对应一个 Town，作为 agent 活动和 user token 的边界。",
                    en: "Create a new product/App entry backed by a Town, the boundary for agent activity and user tokens.",
                }),
            },
            {
                label: t({ zh: "暂停产品", en: "Pause product" }),
                value: "pause",
                hint: t({
                    zh: "暂停某个产品入口，使对应 Town 暂停对外服务。",
                    en: "Pause a product entry so its Town stops serving external requests.",
                }),
            },
            {
                label: t({ zh: "启用产品", en: "Activate product" }),
                value: "activate",
                hint: t({
                    zh: "重新启用已暂停的产品入口，使对应 Town 恢复可用。",
                    en: "Reactivate a paused product entry so its Town becomes available again.",
                }),
            },
            {
                label: t({ zh: "移除产品", en: "Remove product" }),
                value: "remove",
                hint: t({
                    zh: "移除某个产品入口及对应 Town 记录；请确认没有用户仍依赖它的 token。",
                    en: "Remove a product entry and its Town record; ensure no users still depend on its tokens.",
                }),
            },
            {
                label: t({ zh: "签发 user token", en: "Issue user token" }),
                value: "token",
                hint: t({
                    zh: "为指定 user_id 签发绑定到某个 Town 的 user token，用于用户侧访问 City 能力。",
                    en: "Issue a user token for a user_id scoped to a Town for user-side City access.",
                }),
            },
            { label: t({ zh: "导航", en: "Navigation" }), value: "__section_navigation__", disabled: true },
            {
                label: t({ zh: "返回", en: "Back" }),
                value: "back",
                hint: t({ zh: "返回 Admin 管理菜单", en: "Return to Admin management" }),
            },
        ]);
        if (!act || act === "back")
            return;
        try {
            if (act === "list") {
                const items = await runtime.with_loading(t({ zh: "产品管理", en: "Products" }), async () => await city.towns.list());
                await runtime.show_table({
                    title: t({ zh: `${items.length} 个产品`, en: `${items.length} Products` }),
                    columns: ["Town ID", t({ zh: "名称", en: "Name" }), t({ zh: "状态", en: "Status" })],
                    rows: items.map((town) => ({
                        cells: [town.town_id, town.name, town.status],
                    })),
                    empty_message: t({ zh: "暂无 Town。", en: "No towns." }),
                });
            }
            else if (act === "create") {
                const name = await runtime.text(t({ zh: "产品名称", en: "product name" }));
                if (!name)
                    continue;
                const town_id = await runtime.text("town_id (optional)");
                const town = await runtime.with_loading(t({ zh: "创建产品", en: "Create product" }), async () => await city.towns.create(town_id
                    ? { name, town_id }
                    : { name }));
                await runtime.show_message("success", t({ zh: `已创建：${town.town_id}`, en: `created: ${town.town_id}` }));
            }
            else if (act === "pause") {
                const id = await runtime.text("town_id");
                if (!id)
                    continue;
                await runtime.with_loading(t({ zh: "暂停产品", en: "Pause product" }), async () => await city.towns.pause(id));
                await runtime.show_message("success", t({ zh: `已暂停：${id}`, en: `paused: ${id}` }));
            }
            else if (act === "activate") {
                const id = await runtime.text("town_id");
                if (!id)
                    continue;
                await runtime.with_loading(t({ zh: "启用产品", en: "Activate product" }), async () => await city.towns.activate(id));
                await runtime.show_message("success", t({ zh: `已启用：${id}`, en: `activated: ${id}` }));
            }
            else if (act === "remove") {
                const id = await runtime.text("town_id");
                if (!id)
                    continue;
                await runtime.with_loading(t({ zh: "移除产品", en: "Remove product" }), async () => await city.towns.remove(id));
                await runtime.show_message("success", t({ zh: `已移除：${id}`, en: `removed: ${id}` }));
            }
            else if (act === "token") {
                const town_id = await runtime.text("town_id");
                if (!town_id)
                    continue;
                const user_id = await runtime.text("user_id");
                if (!user_id)
                    continue;
                const token = await runtime.with_loading(t({ zh: "签发 Token", en: "Issue Token" }), async () => await city.towns.tokens.apply({ town_id, user_id }));
                await runtime.show_text("Town Token", token.user_token);
            }
        }
        catch (e) {
            rethrowAdminAuthError(e);
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
//# sourceMappingURL=towns.js.map