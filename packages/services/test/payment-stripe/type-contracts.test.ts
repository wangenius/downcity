/**
 * Stripe payment provider 类型契约测试。
 */

import { CityBase } from "@downcity/city";
import {
  paymentService,
  stripePaymentProvider,
  type PaymentServiceBalanceBridge,
} from "../../src/index.js";

const base = new CityBase({
  db: {} as never,
});

const balance: PaymentServiceBalanceBridge = {
  async readTopup() {
    return {
      topup_id: "topup_demo",
      user_id: "user_1",
      amount: 100,
      unit: "credits",
      status: "pending",
      note: "demo",
    };
  },
  async finishTopup() {
    return {
      topup_id: "topup_demo",
      user_id: "user_1",
      amount: 100,
      unit: "credits",
      status: "paid",
      note: "demo",
    };
  },
};

base.use(paymentService({
  balance,
  providers: [
    stripePaymentProvider({
      currency: "usd",
    }),
  ],
}));
