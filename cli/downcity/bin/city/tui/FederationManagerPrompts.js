/**
 * Federation 管理器交互式 prompts。
 *
 * 关键点（中文）
 * - 负责收集 Federation URL、选择 Federation、充值输入等。
 * - 与 TUI 状态解耦，便于复用和单独测试。
 */
import { DEFAULT_FEDERATION_URL, list_federations, normalizeCityUrl, readCityString, } from "../../city/shared/CityStateStore.js";
import { t } from "../../shared/CliLocale.js";
import prompts from "../../city/tui/Prompts.js";
export async function prompt_city_url() {
    const response = (await prompts({
        type: "text",
        name: "federation_url",
        message: "City URL",
        initial: DEFAULT_FEDERATION_URL,
    }));
    const federation_url = normalizeCityUrl(String(response.federation_url || ""));
    return federation_url || null;
}
export async function prompt_federation() {
    const servers = list_federations();
    const response = (await prompts({
        type: "select",
        name: "federation_url",
        message: t({
            zh: "选择 Federation",
            en: "Select Federation"
        }),
        choices: servers.map((server) => ({
            title: server.selected ? `* ${server.name}` : server.name,
            description: `${server.source} · ${server.federation_url}`,
            value: server.federation_url,
        })),
        initial: Math.max(0, servers.findIndex((server) => server.selected)),
    }));
    const federation_url = readCityString(response.federation_url);
    if (!federation_url)
        return null;
    return servers.find((server) => server.federation_url === federation_url) ?? null;
}
export async function prompt_recharge_input() {
    const response = (await prompts([
        {
            type: "number",
            name: "amount",
            message: "充值金额",
            min: 1,
            validate: (value) => Number.isInteger(value) && value > 0 ? true : "请输入正整数",
        },
        {
            type: "text",
            name: "note",
            message: "说明（可选）",
            initial: "City recharge",
        },
        {
            type: "confirm",
            name: "open_checkout",
            message: "创建后打开支付页面？",
            initial: true,
        },
    ]));
    const amount = Number(response.amount);
    if (!Number.isInteger(amount) || amount <= 0)
        return null;
    return {
        amount,
        method_id: "stripe",
        note: readCityString(response.note),
        open_checkout: response.open_checkout !== false,
    };
}
//# sourceMappingURL=FederationManagerPrompts.js.map