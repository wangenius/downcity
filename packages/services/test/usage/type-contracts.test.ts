/**
 * Usage 服务类型契约测试。
 */

import { InfraRuntime } from "@downcity/infra";
import { usageService } from "../../src/index.js";

const base = new InfraRuntime({
  db: {} as never,
});

base.use(usageService({
  record_errors: true,
}));
