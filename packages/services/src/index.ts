/**
 * @downcity/services 统一公共入口。
 *
 * 关键说明（中文）
 * - 对外统一暴露 Downcity 官方服务
 * - 保留 accounts / balance / payment / usage 四个清晰服务边界
 * - Stripe / Creem / Dodo / Waffo 统一作为 payment provider 暴露
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

export {
  creemPaymentProvider,
  dodoPaymentProvider,
  paymentService,
  stripePaymentProvider,
  waffoPaymentProvider,
} from "./payment/index.js";
export type {
  PaymentCheckoutCreateResult,
  PaymentCreateCheckoutInput,
  PaymentEventRecord,
  PaymentEventSyncStatus,
  PaymentMethodItem,
  PaymentMethodReason,
  PaymentMethodType,
  PaymentProvider,
  PaymentProviderCheckoutInput,
  PaymentProviderCheckoutResult,
  PaymentProviderContext,
  PaymentProviderWebhookEvent,
  PaymentProviderWebhookInput,
  PaymentRecord,
  PaymentServiceBalanceBridge,
  PaymentServiceOptions,
  PaymentStatus,
  PaymentTopupRecord,
} from "./payment/types.js";
export type {
  CreemPaymentProviderOptions,
  DodoPaymentProviderOptions,
  StripePaymentProviderOptions,
  WaffoPaymentProviderOptions,
} from "./payment/types.js";

export { usageEvents, usageService } from "./usage/index.js";
export type { UsageServiceOptions } from "./usage/index.js";
