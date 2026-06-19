/**
 * UI 工具模块。
 *
 * 提供 CLI 交互所需的输入/输出封装。
 * 模型选择接受通用的 { id, name, hint } 数组，不依赖 server model 类型。
 */
import { password, select, text, isCancel, intro, log } from "../tui/Prompts.js";
import { t } from "../../shared/CliLocale.js";
export { intro, log, isCancel };
// ============================================================
// 显示函数
// ============================================================
export function show(text) { log.info(text); }
export function showError(text) { log.error(text); }
export function showSuccess(text) { log.success(text); }
// ============================================================
// 交互 prompts
// ============================================================
/** 主命令菜单 */
export async function askUserCommand() {
    const s = await select({ message: t({
            zh: "工作区",
            en: "Workspace",
        }), options: [
            { label: "Models", value: "models", hint: t({ zh: "列出并选择模型", en: "List and select model" }) },
            { label: "Balance", value: "balance", hint: t({ zh: "查看当前余额", en: "View current balance" }) },
            { label: "History", value: "history", hint: t({ zh: "查看余额流水", en: "View balance ledger" }) },
            { label: "Topups", value: "topups", hint: t({ zh: "查看充值订单", en: "View recharge orders" }) },
            { label: "Recharge (Stripe)", value: "recharge", hint: t({ zh: "创建 Checkout 并在浏览器支付", en: "Create Checkout and pay in browser" }) },
            { label: t({ zh: "创建 topup", en: "Create topup" }), value: "topup_create", hint: t({ zh: "仅创建待处理 topup 订单", en: "Create a pending topup order only" }) },
            { label: t({ zh: "兑换码", en: "Redeem code" }), value: "redeem_code", hint: t({ zh: "兑换一次性余额兑换码", en: "Redeem a one-time credit code" }) },
            { label: t({ zh: "我的资料", en: "My profile" }), value: "me" },
            { label: t({ zh: "列出服务", en: "List services" }), value: "services" },
            { label: t({ zh: "调用服务", en: "Call service" }), value: "service" },
            { label: t({ zh: "Server 管理", en: "Server management" }), value: "server_management", hint: t({ zh: "低频 admin 访问和本地连接配置", en: "Low-frequency admin access and local connection settings" }) },
            { label: t({ zh: "切换 Server", en: "Switch Server" }), value: "switch_server" },
            { label: t({ zh: "退出登录", en: "Sign out" }), value: "sign_out" },
            { label: t({ zh: "退出", en: "Exit" }), value: "quit" },
        ] });
    if (!s || isCancel(s))
        return undefined;
    return s;
}
/** 文本输入 */
export async function askText(label) {
    const v = await text({ message: label });
    return (!v || isCancel(v)) ? undefined : v;
}
/** 密码输入 */
export async function askSecret(label) {
    const v = await password({ message: label });
    return (!v || isCancel(v)) ? undefined : v;
}
/** 列出并选择模型，返回模型 id 或 undefined */
export async function askModel(models, currentModel) {
    const options = models.map((m) => ({
        label: m.id === currentModel ? `★ ${m.name}` : `   ${m.name}`,
        value: m.id,
        hint: m.hint,
    }));
    const s = await select({ message: t({
            zh: "选择模型（★ 当前）",
            en: "Select model (★ current)",
        }), options });
    return (!s || isCancel(s)) ? undefined : String(s);
}
//# sourceMappingURL=ui.js.map