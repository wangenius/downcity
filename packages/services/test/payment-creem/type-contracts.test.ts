/**
 * Creem payment 服务类型契约测试。
 *
 * 关键说明（中文）
 * - 这个文件只做编译期契约验证
 * - 覆盖公开 service、method 和主要返回类型
 */

import { CityBase } from "@downcity/city";
import {
  creemPaymentMethod,
  creemPaymentService,
  paymentService,
  type CreemCheckoutCreateResult,
  type CreemPaymentServiceBalanceBridge,
} from "../../src/index.js";

const balance: CreemPaymentServiceBalanceBridge = {
  async readTopup(topup_id) {
    return {
      topup_id,
      user_id: "user_1",
      amount: 100,
      unit: "credits",
      status: "pending",
      note: "demo",
    };
  },
  async finishTopup(topup_id) {
    return {
      topup_id,
      user_id: "user_1",
      amount: 100,
      unit: "credits",
      status: "paid",
      note: "demo",
    };
  },
};

const base = new CityBase({ db: {} as any, dialect: "sqlite" });

base.use(paymentService({
  methods: [
    creemPaymentMethod({
      api_key: "creem_test",
      product_id: "prod_test",
      currency: "usd",
    }),
  ],
}));

base.use(creemPaymentService({
  balance,
  api_key: "creem_test",
  product_id: "prod_test",
  webhook_secret: "whsec_test",
}));

const checkout: CreemCheckoutCreateResult = {
  payment_id: "pay_demo",
  topup_id: "topup_demo",
  creem_checkout_id: "ch_demo",
  checkout_url: "https://checkout.creem.test/ch_demo",
  status: "pending",
};

void checkout;
