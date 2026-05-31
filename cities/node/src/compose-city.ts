/**
 * Node CityBase 装配模块。
 *
 * Node 街区拥有自己的 CityBase 组装逻辑，避免再通过独立 shared 包间接复用。
 * 这里集中安装官方公共服务、余额系统、支付目录、Stripe 支付闭环和 AIService。
 */

import { CityBase, AIService, type CityBaseOptions, type ModelConfig } from "@downcity/city";
import {
  accountsService,
  balanceService,
  paymentService,
  stripePaymentMethod,
  stripePaymentService,
  usageService,
  type BalanceExtra,
  type BalanceService,
  type StripePaymentServiceBalanceBridge,
} from "@downcity/services";

/**
 * Node CityBase 默认余额桥接配置。
 */
export interface ComposeCityBalanceOptions {
  /** 初始化赠送余额。 */
  init?: number;
  /** 余额单位。 */
  unit?: string;
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
  /** 是否安装统一 payment service。 */
  enable_payment?: boolean;
  /** 是否安装 stripe 支付闭环。 */
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
  /** AI service 实例，便于外部增加 hook。 */
  ai: AIService;
} {
  const city = new CityBase(options);

  city.use(accountsService({
    token_ttl: options.token_ttl,
  }));

  const balance = balanceService({
    init: options.balance?.init,
    unit: options.balance?.unit,
  });
  city.use(balance);

  if (options.enable_payment !== false) {
    city.use(paymentService({
      methods: [stripePaymentMethod()],
    }));
  }

  city.use(usageService({
    record_errors: options.record_usage_errors,
  }));

  if (options.enable_stripe_payment !== false) {
    const stripe_balance_bridge: StripePaymentServiceBalanceBridge = {
      readTopup: async (topup_id: string) => await balance.readTopup(topup_id),
      finishTopup: async (topup_id: string, extra: BalanceExtra) => await balance.finishTopup(topup_id, extra),
    };
    city.use(stripePaymentService({
      balance: stripe_balance_bridge,
    }));
  }

  const ai = new AIService();
  ai.use(options.models);
  city.use(ai);

  return {
    city,
    balance,
    ai,
  };
}
