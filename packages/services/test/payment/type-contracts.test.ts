/**
 * Payment 服务类型契约测试。
 */

import { InfraRuntime } from "@downcity/infra";
import { paymentService, stripePaymentMethod } from "../../src/index.js";

const base = new InfraRuntime({
  db: {} as never,
});

base.use(paymentService({
  methods: [
    stripePaymentMethod(),
  ],
}));
