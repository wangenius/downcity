/**
 * Console Inline 即时模式源码约束测试（node:test）。
 *
 * 关键点（中文）
 * - 旧的 `/api/ui/model/infer` 已移除。
 * - Inline Composer 即时模式必须统一走 `/api/ui/inline/instant-run`。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SOURCE_FILE =
  "/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/console/InlineInstantRoutes.ts";
const MODEL_ROUTE_FILE =
  "/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/console/ModelApiRoutes.ts";

test("inline instant routes expose unified instant-run endpoint", () => {
  const source = readFileSync(SOURCE_FILE, "utf8");
  const modelSource = readFileSync(MODEL_ROUTE_FILE, "utf8");

  assert.match(source, /\/api\/ui\/inline\/instant-run/u);
  assert.match(source, /executorType/u);
  assert.doesNotMatch(modelSource, /\/api\/ui\/model\/infer/u);
});
