/**
 * Payment 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { paymentService, stripePaymentProvider, type PaymentServiceBalanceBridge } from "../../src/index.js";

const balance: PaymentServiceBalanceBridge = {
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

const base = new CityBase({
  db: {} as never,
});

base.use(paymentService({
  balance,
  providers: [
    stripePaymentProvider(),
  ],
}));
