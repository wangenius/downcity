/**
 * Payment 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { paymentService, stripePaymentMethod } from "../../src/index.js";

const base = new CityBase({
  db: {} as never,
});

base.use(paymentService({
  methods: [
    stripePaymentMethod(),
  ],
}));
