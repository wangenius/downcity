/**
 * Creem payment provider 类型契约测试。
 *
 * 关键说明（中文）
 * - 这个文件只做编译期契约验证
 * - 覆盖统一 PaymentService、provider 和主要返回类型
 */

import { CityBase } from "@downcity/city";
import {
  creemPaymentProvider,
  paymentService,
  type PaymentCheckoutCreateResult,
  type PaymentServiceBalanceBridge,
} from "../../src/index.js";

const balance: PaymentServiceBalanceBridge = {
  async readTopup(topup_id) {
    return {
      topup_id,
      user_id: "user_1",
      amount: 100,
      status: "pending",
      note: "demo",
    };
  },
  async finishTopup(topup_id) {
    return {
      topup_id,
      user_id: "user_1",
      amount: 100,
      status: "paid",
      note: "demo",
    };
  },
};

const base = new CityBase({ db: {} as any, dialect: "sqlite" });

base.use(paymentService({
  balance,
  providers: [
    creemPaymentProvider({
      api_key: "creem_test",
      product_id: "prod_test",
      currency: "usd",
    }),
  ],
}));

const checkout: PaymentCheckoutCreateResult = {
  payment_id: "pay_demo",
  provider: "creem",
  topup_id: "topup_demo",
  provider_session_id: "ch_demo",
  provider_payment_id: "",
  provider_order_id: "",
  checkout_url: "https://checkout.creem.test/ch_demo",
  status: "pending",
};

void checkout;
