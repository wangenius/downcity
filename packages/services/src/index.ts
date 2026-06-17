/**
 * @downcity/services 统一公共入口。
 *
 * 关键说明（中文）
 * - 对外统一暴露 Downcity 官方服务
 * - 保留 accounts / balance / billing / payment / usage 五个清晰服务边界
 * - Stripe / Creem / Dodo / Waffo 统一作为 payment provider 暴露
 * - 业务侧只需要从一个包完成导入
 */

export { accountsOAuthStates, userProfiles } from "./accounts/schema.js";
export { AccountsService } from "./accounts/index.js";
export type { AccountsServiceOptions } from "./accounts/index.js";

export { balanceAccounts, balanceLedger, balanceRedeemCodes, balanceTopups } from "./balance/schema.js";
export { BalanceService } from "./balance/service.js";
export type {
  BalanceAccount,
  BalanceCreditsConversion,
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
  BalanceUserBalance,
} from "./balance/types.js";
export {
  CREDIT_DECIMAL_PLACES,
  MICROCREDITS_PER_CREDIT,
} from "./types/Amount.js";
export type {
  Credits,
  Microcredits,
} from "./types/Amount.js";

export { billingCharges, billingPricingRules, BillingService } from "./billing/index.js";
export type {
  BillingBalanceBridge,
  BillingChargeInput,
  BillingCharge,
  BillingChargeQuery,
  BillingChargeStatus,
  BillingPricingRule,
  BillingPricingRuleInput,
  BillingPricingRuleQuery,
  BillingPricingRuleStatus,
  BillingServiceOptions,
} from "./billing/index.js";

export {
  creemPaymentProvider,
  dodoPaymentProvider,
  PaymentService,
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
 PaymentServiceOptions,
 PaymentTopupRecord,
 PaymentStatus,
} from "./payment/types.js";
export type {
  CreemPaymentProviderOptions,
  DodoPaymentProviderOptions,
  StripePaymentProviderOptions,
  WaffoPaymentProviderOptions,
} from "./payment/types.js";

export { usageEvents, UsageService } from "./usage/index.js";
export type { UsageServiceOptions } from "./usage/index.js";
