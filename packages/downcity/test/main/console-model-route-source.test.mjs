/**
 * Console 模型推理路由源码约束测试（node:test）。
 *
 * 关键点（中文）
 * - 在现有构建被无关 TS 错误阻塞时，先用源码断言锁定新接口契约。
 * - 路由必须暴露 `/api/ui/model/infer`，并把请求转发给 `inferWithModel`。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const MODEL_API_ROUTES_FILE =
  "/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/console/ModelApiRoutes.ts";

test("model api routes expose infer endpoint", () => {
  const source = readFileSync(MODEL_API_ROUTES_FILE, "utf8");

  assert.match(source, /app\.post\("\/api\/ui\/model\/infer"/u);
  assert.match(source, /inferWithModel/u);
  assert.match(source, /pageContext/u);
});
