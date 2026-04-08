/**
 * Prompt 变量替换测试（node:test）。
 *
 * 关键点（中文）
 * - `current_year` 必须支持模板替换。
 * - `stable` 模式下也必须保留真实年份，确保 system prompt 直接拿到年份信息。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { replaceVariablesInPrompts } from "../../bin/session/composer/system/default/variables/VariableReplacer.js";

test("replaceVariablesInPrompts injects current_year in stable mode", async () => {
  const rendered = await replaceVariablesInPrompts("year={{current_year}}", {
    mode: "stable",
    projectPath: "/tmp/demo",
    sessionId: "session_demo",
  });
  assert.match(rendered, /^year=\d{4}$/);
});
