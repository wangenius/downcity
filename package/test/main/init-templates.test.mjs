/**
 * Init templates 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 `{{agent_name}}` 能被渲染替换。
 * - 验证未知变量保持原样，避免静默丢信息。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROFILE_MD_TEMPLATE,
  renderInitTemplate,
} from "../../bin/main/constants/InitTemplates.js";

test("renderInitTemplate replaces agent_name placeholder", () => {
  const rendered = renderInitTemplate(DEFAULT_PROFILE_MD_TEMPLATE, {
    agent_name: "demo-agent",
  });
  assert.equal(rendered.includes("{{agent_name}}"), false);
  assert.equal(rendered.includes("# 你叫 demo-agent"), true);
});

test("renderInitTemplate keeps unknown placeholders untouched", () => {
  const rendered = renderInitTemplate("hello {{unknown_key}}", {
    agent_name: "demo-agent",
  });
  assert.equal(rendered, "hello {{unknown_key}}");
});
