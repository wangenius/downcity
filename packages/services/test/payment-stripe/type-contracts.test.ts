/**
 * Stripe payment provider 类型契约测试。
 */

import { Federation } from "@downcity/city";
import {
  PaymentService,
  stripePaymentProvider,
} from "../../src/index.js";

const base = new Federation({
  db: {} as never,
});

const readTopup = async (_topup_id: string) => ({
  topup_id: "topup_demo",
  user_id: "user_1",
  amount: 100,
  status: "pending",
  note: "demo",
});

const finishTopup = async (_topup_id: string) => ({
  topup_id: "topup_demo",
  user_id: "user_1",
  amount: 100,
  status: "paid",
  note: "demo",
});

base.use(new PaymentService({
  readTopup,
  finishTopup,
  providers: [
    stripePaymentProvider({
      currency: "usd",
    }),
  ],
}));
