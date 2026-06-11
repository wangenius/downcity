/**
 * Edge CityBase 装配模块。
 *
 * 关键点（中文）
 * - 这里负责组装 edge 项目的默认 City 服务能力。
 * - 示例项目把 accounts、balance、payment、usage、ai 这些常见服务集中接好。
 * - 后续继续扩展 D1、缓存、计费 hook 或自定义 service 时，都从这里演化。
 */

import { CityBase, AIService, type CityBaseOptions, type ModelConfig } from "@downcity/city";
import {
  accountsService,
  balanceService,
  creemPaymentProvider,
  dodoPaymentProvider,
  paymentService,
  stripePaymentProvider,
  usageService,
  waffoPaymentProvider,
  type BalanceService,
  type PaymentServiceBalanceBridge,
} from "@downcity/services";

/**
 * Edge CityBase 默认余额桥接配置。
 */
export interface ComposeCityBalanceOptions {
  /** 初始化赠送余额。 */
  init?: number;
  /** 余额单位。 */
  unit?: string;
}

/**
 * Edge CityBase 装配参数。
 */
export interface ComposeCityBaseOptions extends CityBaseOptions {
  /** Drizzle database 对象。 */
  db: CityBaseOptions["db"];
  /** 数据库方言。 */
  dialect?: CityBaseOptions["dialect"];
  /** 原始数据库实例。 */
  raw?: CityBaseOptions["raw"];
  /** 内部运行时能力。 */
  runtime?: CityBaseOptions["runtime"];
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
  /** 是否安装 creem 支付闭环。 */
  enable_creem_payment?: boolean;
  /** 是否安装 dodo 支付闭环。 */
  enable_dodo_payment?: boolean;
  /** 是否安装 waffo 支付闭环。 */
  enable_waffo_payment?: boolean;
}

/**
 * 组装一个包含默认公共服务与 AIService 的 Edge CityBase。
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
    const payment_balance_bridge: PaymentServiceBalanceBridge = {
      readTopup: async (topup_id: string) => await balance.readTopup(topup_id),
      finishTopup: async (topup_id: string, extra) => await balance.finishTopup(topup_id, extra),
    };
    city.use(paymentService({
      balance: payment_balance_bridge,
      providers: [
        ...(options.enable_stripe_payment === false ? [] : [stripePaymentProvider()]),
        ...(options.enable_creem_payment === false ? [] : [creemPaymentProvider()]),
        ...(options.enable_dodo_payment === false ? [] : [dodoPaymentProvider()]),
        ...(options.enable_waffo_payment === false ? [] : [waffoPaymentProvider()]),
      ],
    }));
  }

  city.use(usageService({
    record_errors: options.record_usage_errors,
  }));

  const ai = new AIService();
  ai.use(options.models);
  city.use(ai);

  return {
    city,
    balance,
    ai,
  };
}
