/**
 * Usage 服务类型契约测试。
 */

import { City } from "@downcity/city";
import { usageService } from "../../src/index.js";

const base = new City({
  db: {} as never,
});

base.use(usageService({
  record_errors: true,
}));
