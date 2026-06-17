/**
 * Payment 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { PaymentService, stripePaymentProvider } from "../../src/index.js";

const readTopup = async (topup_id: string) => ({
  topup_id,
  user_id: "user_1",
  amount: 100,
  status: "pending",
  note: "demo",
});

const finishTopup = async (topup_id: string) => ({
  topup_id,
  user_id: "user_1",
  amount: 100,
  status: "paid",
  note: "demo",
});

const base = new CityBase({
  db: {} as never,
});

base.use(new PaymentService({
  readTopup,
  finishTopup,
  providers: [
    stripePaymentProvider(),
  ],
}));
