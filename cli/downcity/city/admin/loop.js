/**
 * Admin 命令循环。
 *
 * 关键说明（中文）
 * - `city` 点开某个 City 后直接进入这个菜单。
 * - City 连接配置、admin key 更新等低频操作通过 `更多` 回调交给 workspace 层处理。
 */
import { City } from "@downcity/city";
import { adminErrorMessage, isAdminAuthError } from "./auth-error.js";
import { create_admin_tui_runtime } from "../tui/AdminTuiRuntime.js";
import { manageEnv } from "./commands/service-env.js";
import { manageTowns } from "./commands/towns.js";
import { manageAccounts } from "./commands/accounts.js";
import { manageBalance } from "./commands/balance.js";
import { manageUsage } from "./commands/usage.js";
import { managePayment } from "./commands/payment.js";
import { manageCustom } from "./commands/custom.js";
import { manageModels } from "./commands/models.js";
import { manageInstruction } from "./commands/instruction.js";
import { t } from "../i18n.js";
const commands = {
    env: manageEnv,
    instruction: manageInstruction,
    models: manageModels,
    towns: manageTowns,
    accounts: manageAccounts,
    balance: manageBalance,
    usage: manageUsage,
    payment: managePayment,
    custom: manageCustom,
};
export async function adminLoop(session, options) {
    const admin = new City({
        role: "admin",
        city_url: session.base_url,
        admin_secret_key: session.admin_secret_key,
    });
    const embedded = options?.embedded !== false;
    const runtime = options?.runtime ?? create_admin_tui_runtime(options?.title ?? "Admin");
    while (true) {
        const svc = await runtime.select_nav(options?.title
            ?? (embedded
                ? t({
                    zh: "Admin 管理",
                    en: "Admin management",
                })
                : t({
                    zh: "管理服务",
                    en: "Manage Service",
                })), [
            {
                label: t({
                    zh: "环境变量",
                    en: "Env",
                }),
                value: "env",
                hint: t({
                    zh: "查看并配置环境变量",
                    en: "View and configure environment variables",
                }),
            },
            {
                label: t({
                    zh: "City 指令",
                    en: "City Instruction",
                }),
                value: "instruction",
                hint: t({
                    zh: "读取聚合后的 city/service 指引",
                    en: "Read aggregated city/service guidance",
                }),
            },
            {
                label: t({
                    zh: "模型",
                    en: "Models",
                }),
                value: "models",
                hint: t({
                    zh: "查看模型就绪状态与缺失 env",
                    en: "Read model readiness and missing env requirements",
                }),
            },
            {
                label: t({
                    zh: "Towns",
                    en: "Towns",
                }),
                value: "towns",
            },
            {
                label: t({
                    zh: "账户",
                    en: "Accounts",
                }),
                value: "accounts",
            },
            {
                label: t({
                    zh: "余额",
                    en: "Balance",
                }),
                value: "balance",
            },
            {
                label: t({
                    zh: "用量",
                    en: "Usage",
                }),
                value: "usage",
            },
            {
                label: t({
                    zh: "支付（Stripe）",
                    en: "Payment (Stripe)",
                }),
                value: "payment",
            },
            {
                label: t({
                    zh: "自定义服务...",
                    en: "Custom service...",
                }),
                value: "custom",
            },
            ...(options?.on_more
                ? [{
                        label: t({
                            zh: "更多",
                            en: "More",
                        }),
                        value: "more",
                        hint: t({
                            zh: "更新 admin、编辑 City、移除 City",
                            en: "Update admin, edit City, remove City",
                        }),
                    }]
                : []),
            ...(embedded
                ? [{
                        label: t({
                            zh: "返回",
                            en: "Back",
                        }),
                        value: "back",
                    }]
                : [
                    {
                        label: t({
                            zh: "切换到 User",
                            en: "Switch to User",
                        }),
                        value: "switch",
                    },
                    {
                        label: t({
                            zh: "退出登录",
                            en: "Logout",
                        }),
                        value: "logout",
                    },
                ]),
            {
                label: t({
                    zh: "退出",
                    en: "Quit",
                }),
                value: "quit",
            },
        ]);
        if (!svc) {
            runtime.close();
            return embedded ? "back" : "quit";
        }
        if (svc === "quit") {
            runtime.close();
            return "quit";
        }
        if (svc === "back") {
            runtime.close();
            return "back";
        }
        if (svc === "more" && options?.on_more) {
            const result = await options.on_more(runtime);
            if (result === "quit") {
                runtime.close();
                return "quit";
            }
            if (result === "back" || result === "removed") {
                runtime.close();
                return "back";
            }
            continue;
        }
        if (svc === "logout") {
            await runtime.show_message("success", t({
                zh: "已退出 admin 模式",
                en: "left admin mode",
            }));
            runtime.close();
            return "logout";
        }
        if (svc === "switch") {
            runtime.close();
            return "switch_identity";
        }
        try {
            const command_key = String(svc);
            await commands[command_key]?.(admin, session.base_url, runtime);
        }
        catch (e) {
            if (isAdminAuthError(e)) {
                await runtime.show_message("error", adminErrorMessage(e));
                runtime.close();
                return "logout";
            }
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
//# sourceMappingURL=loop.js.map