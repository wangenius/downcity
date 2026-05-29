/**
 * Stripe 支付服务类型契约测试。
 */

import { InfraRuntime } from "@downcity/infra";
import { stripePaymentService } from "../../src/index.js";

const base = new InfraRuntime({
  db: {} as never,
});

const balance = {
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

base.use(stripePaymentService({
  balance,
}));
