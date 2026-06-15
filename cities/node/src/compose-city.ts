/**
 * Node CityBase 装配模块。
 *
 * Node 街区拥有自己的 CityBase 组装逻辑，避免再通过独立 shared 包间接复用。
 * 这里集中安装官方公共服务、余额系统、统一 Payment 服务和 AIService。
 */

import { CityBase, AIService, type CityBaseOptions, type ModelConfig } from "@downcity/city";
import {
  accountsService,
  billingService,
  balanceService,
  paymentService,
  stripePaymentProvider,
  usageService,
  type BalanceService,
  type BillingService,
  type PaymentServiceBalanceBridge,
  type BillingPricingRuleInput,
} from "@downcity/services";

/**
 * Node CityBase 默认余额桥接配置。
 */
export interface ComposeCityBalanceOptions {
  /** 初始化赠送余额。 */
  init?: number;
}

/**
 * Node CityBase 装配参数。
 */
export interface ComposeCityBaseOptions extends CityBaseOptions {
  /** 要注册的模型列表。 */
  models: ModelConfig[];
  /** accounts token ttl。 */
  token_ttl?: string;
  /** usage 是否记录错误。 */
  record_usage_errors?: boolean;
  /** 余额配置。 */
  balance?: ComposeCityBalanceOptions;
  /** billing pricing rules。 */
  pricing_rules?: BillingPricingRuleInput[];
  /** 是否安装 billing service。 */
  enable_billing?: boolean;
  /** 是否安装统一 payment service。 */
  enable_payment?: boolean;
  /** 是否启用 Stripe payment provider。 */
  enable_stripe_payment?: boolean;
}

/**
 * 组装一个包含默认公共服务与 AIService 的 Node CityBase。
 */
export function compose_city(options: ComposeCityBaseOptions): {
  /** 已组装完成的 CityBase。 */
  city: CityBase;
  /** balance 服务实例，便于外部追加 hook 或直接调用。 */
  balance: BalanceService;
  /** billing 服务实例，便于外部查询或追加规则。 */
  billing?: BillingService;
  /** AI service 实例，便于外部增加 hook。 */
  ai: AIService;
} {
  const city = new CityBase(options);

  city.use(accountsService({
    token_ttl: options.token_ttl,
  }));

  const balance = balanceService({
    init: options.balance?.init,
  });
  city.use(balance);

  if (options.enable_payment !== false) {
    const payment_balance_bridge: PaymentServiceBalanceBridge = {
      readTopup: async (topup_id: string) => await balance.readTopup(topup_id),
      finishTopup: async (topup_id: string, extra) => await balance.finishTopup(topup_id, extra),
    };
    city.use(paymentService({
      balance: payment_balance_bridge,
      providers: [
        ...(options.enable_stripe_payment === false ? [] : [stripePaymentProvider()]),
      ],
    }));
  }

  city.use(usageService({
    record_errors: options.record_usage_errors,
  }));

  const billing = options.enable_billing === false
    ? undefined
    : billingService({
        balance,
        pricing_rules: options.pricing_rules,
      });
  if (billing) city.use(billing);

  const ai = new AIService();
  ai.use(options.models);
  city.use(ai);

  return {
    city,
    balance,
    billing,
    ai,
  };
}
