/**
 * Init templates 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 `{{agent_name}}` 能被渲染替换。
 * - 验证未知变量保持原样，避免静默丢信息。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROFILE_MD_TEMPLATE } from "../../bin/agent/prompts/common/InitPrompts.js";
import { renderTemplateVariables } from "../../bin/utils/Template.js";

test("renderTemplateVariables replaces agent_name placeholder", () => {
  const rendered = renderTemplateVariables(DEFAULT_PROFILE_MD_TEMPLATE, {
    agent_name: "demo-agent",
  });
  assert.equal(rendered.includes("{{agent_name}}"), false);
  assert.equal(rendered.includes("demo-agent"), true);
});

test("renderTemplateVariables keeps unknown placeholders untouched", () => {
  const rendered = renderTemplateVariables("hello {{unknown_key}}", {
    agent_name: "demo-agent",
  });
  assert.equal(rendered, "hello {{unknown_key}}");
});
