/**
 * Prompt 变量替换测试（node:test）。
 *
 * 关键点（中文）
 * - `current_year` 必须支持模板替换。
 * - `stable` 模式下也必须保留真实年份，确保 system prompt 直接拿到年份信息。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeClockSystemPrompt,
  replaceVariablesInPrompts,
} from "../../bin/session/composer/system/default/variables/VariableReplacer.js";

test("replaceVariablesInPrompts injects current_year in stable mode", async () => {
  const rendered = await replaceVariablesInPrompts("year={{current_year}}", {
    mode: "stable",
    projectPath: "/tmp/demo",
    sessionId: "session_demo",
  });
  assert.match(rendered, /^year=\d{4}$/);
});

test("replaceVariablesInPrompts exposes current_date and timezone variables", async () => {
  const rendered = await replaceVariablesInPrompts("date={{current_date}} tz={{timezone}}", {
    mode: "stable",
    projectPath: "/tmp/demo",
    sessionId: "session_demo",
  });
  assert.match(rendered, /^date=\[See runtime clock tail message\] tz=.+$/);
});

test("replaceVariablesInPrompts keeps time timezone local even when geo resolves elsewhere", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ip: "203.0.113.1",
        city: "Proxy",
        region: "Proxy",
        country_name: "Proxy",
        timezone: "Pacific/Honolulu",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const rendered = await replaceVariablesInPrompts("tz={{timezone}}", {
      mode: "full",
      projectPath: "/tmp/demo",
      sessionId: "session_demo",
    });
    assert.equal(rendered, `tz=${timezone}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildRuntimeClockSystemPrompt appends authoritative runtime time fields", () => {
  const rendered = buildRuntimeClockSystemPrompt({
    projectPath: "/tmp/demo",
    sessionId: "session_demo",
  });
  assert.equal(rendered.includes("# Runtime Clock Context"), true);
  assert.match(rendered, /current_date: \d{4}-\d{2}-\d{2}/);
  assert.match(rendered, /current_time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \(.+\)/);
  assert.match(rendered, /timezone: .+/);
  assert.equal(rendered.includes("session_id: session_demo"), true);
  assert.equal(rendered.includes("project_root: /tmp/demo"), true);
});
