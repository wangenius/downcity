/**
 * Payment 服务类型契约测试。
 */

import { City } from "@downcity/city";
import { paymentService, stripePaymentMethod } from "../../src/index.js";

const base = new City({
  db: {} as never,
});

base.use(paymentService({
  methods: [
    stripePaymentMethod(),
  ],
}));
