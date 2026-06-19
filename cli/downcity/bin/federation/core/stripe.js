/**
 * Stripe 终端辅助模块。
 *
 * 关键说明（中文）
 * - manager 侧不直接管理 Stripe 资源
 * - 这里只负责基于当前 City server 推导可复制的固定回调地址
 * - 这样用户在 Stripe Dashboard 里不需要手动拼 webhook URL
 */
import { normalizeBaseUrl } from "./env.js";
/**
 * 基于当前 City 地址构建 Stripe 相关 URL。
 */
export function buildStripeEndpoints(baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    return {
        base_url: normalizedBaseUrl,
        webhook_url: `${normalizedBaseUrl}/v1/payment.stripe/webhook`,
        success_url: `${normalizedBaseUrl}/v1/payment.stripe/redirect/success`,
        cancel_url: `${normalizedBaseUrl}/v1/payment.stripe/redirect/cancel`,
    };
}
//# sourceMappingURL=stripe.js.map