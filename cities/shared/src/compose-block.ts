/**
 * 街区共享装配模块。
 *
 * 负责复用 node / edge 之间共同的 City 组装逻辑，
 * 让不同运行时只保留数据库与网络入口差异。
 */

import { City, AIService, type CityOptions, type ModelConfig } from "@downcity/city";
import {
  accountsService,
  balanceService,
  paymentService,
  stripePaymentMethod,
  stripePaymentService,
  usageService,
  type BalanceService,
  type BalanceExtra,
  type StripePaymentServiceBalanceBridge,
} from "@downcity/services";

/**
 * 默认余额桥接配置。
 */
export interface ComposeBlockBalanceOptions {
  /** 初始化赠送余额 */
  init?: number;
  /** 余额单位 */
  unit?: string;
}

/**
 * 共享街区装配参数。
 */
export interface ComposeBlockOptions extends CityOptions {
  /** 要注册的模型列表 */
  models: ModelConfig[];
  /** accounts token ttl */
  token_ttl?: string;
  /** usage 是否记录错误 */
  record_usage_errors?: boolean;
  /** 余额配置 */
  balance?: ComposeBlockBalanceOptions;
  /** 是否安装统一 payment service */
  enable_payment?: boolean;
  /** 是否安装 stripe 支付闭环 */
  enable_stripe_payment?: boolean;
}

/**
 * 组装一个包含默认公共服务与 AIService 的 City。
 */
export function compose_block(options: ComposeBlockOptions): {
  /** 已组装完成的 City */
  base: City;
  /** balance 服务实例，便于外部追加 hook 或直接调用 */
  balance: BalanceService;
  /** AI service 实例，便于外部增加 hook */
  ai: AIService;
} {
  const base = new City(options);

  base.use(accountsService({
    token_ttl: options.token_ttl,
  }));

  const balance = balanceService({
    init: options.balance?.init,
    unit: options.balance?.unit,
  });
  base.use(balance);

  if (options.enable_payment !== false) {
    base.use(paymentService({
      methods: [stripePaymentMethod()],
    }));
  }

  base.use(usageService({
    record_errors: options.record_usage_errors,
  }));

  if (options.enable_stripe_payment !== false) {
    const stripe_balance_bridge: StripePaymentServiceBalanceBridge = {
      readTopup: async (topup_id: string) => await balance.readTopup(topup_id),
      finishTopup: async (topup_id: string, extra: BalanceExtra) => await balance.finishTopup(topup_id, extra),
    };
    base.use(stripePaymentService({
      balance: stripe_balance_bridge,
    }));
  }

  const ai = new AIService();
  ai.use(options.models);
  base.use(ai);

  return {
    base,
    balance,
    ai,
  };
}
