/**
 * @downcity/services 统一公共入口。
 *
 * 关键说明（中文）
 * - 对外统一暴露 Downcity 官方服务
 * - 保留 accounts / balance / payment / payment-stripe / usage 五个清晰子模块
 * - 业务侧只需要从一个包完成导入
 */

export { accountsOAuthStates, userProfiles } from "./accounts/schema.js";
export { AccountsService, accountsService } from "./accounts/index.js";
export type { AccountsServiceOptions } from "./accounts/index.js";

export { balanceAccounts, balanceLedger, balanceRedeemCodes, balanceTopups } from "./balance/schema.js";
export { BalanceService, balanceService } from "./balance/service.js";
export type {
  BalanceAccount,
  BalanceCreateRedeemCodeInput,
  BalanceExtra,
  BalanceHistoryQuery,
  BalanceLedgerEntry,
  BalanceLedgerKind,
  BalanceRedeemCode,
  BalanceRedeemCodeIssueResult,
  BalanceRedeemCodeQuery,
  BalanceRedeemCodeRedeemResult,
  BalanceRedeemCodeStatus,
  BalanceServiceOptions,
  BalanceTopup,
  BalanceTopupQuery,
  BalanceTopupStatus,
} from "./balance/types.js";

export { creemPaymentMethod, dodoPaymentMethod, paymentService, stripePaymentMethod, waffoPaymentMethod } from "./payment/index.js";
export type {
  PaymentMethodDefinition,
  PaymentMethodItem,
  PaymentMethodType,
  PaymentServiceOptions,
} from "./payment/types.js";
export type {
  CreemPaymentMethodOptions,
  DodoPaymentMethodOptions,
  StripePaymentMethodOptions,
  WaffoPaymentMethodOptions,
} from "./payment/types.js";

export { stripeEvents, stripePayments, stripePaymentService } from "./payment-stripe/index.js";
export type {
  StripeCheckoutCreateResult,
  StripeCreateCheckoutInput,
  StripeEventRecord,
  StripeEventSyncStatus,
  StripePaymentRecord,
  StripePaymentServiceBalanceBridge,
  StripePaymentServiceOptions,
  StripePaymentStatus,
  StripePaymentTopupRecord,
  StripeWebhookEvent,
} from "./payment-stripe/types.js";

export { creemEvents, creemPayments, creemPaymentService } from "./payment-creem/index.js";
export type {
  CreemCheckoutCreateResult,
  CreemCreateCheckoutInput,
  CreemEventRecord,
  CreemEventSyncStatus,
  CreemPaymentRecord,
  CreemPaymentServiceBalanceBridge,
  CreemPaymentServiceOptions,
  CreemPaymentStatus,
  CreemPaymentTopupRecord,
  CreemWebhookEvent,
} from "./payment-creem/types.js";

export { dodoEvents, dodoPayments, dodoPaymentService } from "./payment-dodo/index.js";
export type {
  DodoCheckoutCreateResult,
  DodoCreateCheckoutInput,
  DodoEventRecord,
  DodoEventSyncStatus,
  DodoPaymentEnvironment,
  DodoPaymentRecord,
  DodoPaymentServiceBalanceBridge,
  DodoPaymentServiceOptions,
  DodoPaymentStatus,
  DodoPaymentTopupRecord,
  DodoWebhookEvent,
} from "./payment-dodo/types.js";

export { waffoEvents, waffoPayments, waffoPaymentService } from "./payment-waffo/index.js";
export type {
  WaffoCheckoutCreateResult,
  WaffoCreateCheckoutInput,
  WaffoEventRecord,
  WaffoEventSyncStatus,
  WaffoPaymentEnvironment,
  WaffoPaymentRecord,
  WaffoPaymentServiceBalanceBridge,
  WaffoPaymentServiceOptions,
  WaffoPaymentStatus,
  WaffoPaymentTopupRecord,
  WaffoWebhookEvent,
  WaffoWebhookEventData,
} from "./payment-waffo/types.js";

export { usageEvents, usageService } from "./usage/index.js";
export type { UsageServiceOptions } from "./usage/index.js";
