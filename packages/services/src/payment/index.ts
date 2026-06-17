/**
 * Payment 子模块公共入口。
 *
 * 关键点（中文）
 * - PaymentService class 在 service.ts
 * - 路由注册逻辑在 routes.ts
 * - provider 工厂函数在 providers.ts
 */

export { PaymentService } from "./service.js";
export type { PaymentServiceOptions } from "./types.js";
export { paymentPayments, paymentEvents } from "./schema.js";
export {
  creemPaymentProvider,
  dodoPaymentProvider,
  stripePaymentProvider,
  waffoPaymentProvider,
} from "./providers.js";
