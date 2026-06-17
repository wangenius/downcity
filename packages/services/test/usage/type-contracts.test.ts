/**
 * Usage 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { UsageService } from "../../src/index.js";

const base = new CityBase({
  db: {} as never,
});

base.use(new UsageService({
  record_errors: true,
}));
