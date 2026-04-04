/**
 * Task `when` 规则测试（node:test）。
 *
 * 关键点（中文）
 * - 一次性触发统一收敛为 `time:<ISO8601-with-timezone>`
 * - `@manual` / cron / one-shot 的判定边界要稳定
 * - cron alias 归一化与非法表达式拒绝要稳定
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  isTaskWhenManual,
  isTaskWhenOneShot,
  normalizeTaskCronExpression,
  normalizeTaskWhen,
  resolveTaskWhenCronExpression,
  resolveTaskWhenOneShotMs,
} from "../../bin/services/task@/city/runtime/console/Model.js";

test("normalizeTaskWhen rejects ISO datetime without explicit timezone", () => {
  const result = normalizeTaskWhen("2026-03-08T10:30:00");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /with timezone/i);
});

test("normalizeTaskWhen normalizes timezone-aware datetime to one-shot UTC form", () => {
  const result = normalizeTaskWhen("2026-03-08T10:30:00+08:00");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value, "time:2026-03-08T02:30:00.000Z");
  assert.equal(isTaskWhenOneShot(result.value), true);
  assert.equal(resolveTaskWhenOneShotMs(result.value), Date.parse("2026-03-08T02:30:00.000Z"));
});

test("manual alias stays manual and does not resolve to cron", () => {
  const result = normalizeTaskWhen("@MANUAL");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value, "@manual");
  assert.equal(isTaskWhenManual(result.value), true);
  assert.equal(resolveTaskWhenCronExpression(result.value), null);
});

test("cron alias normalizes to expression and rejects invalid expression", () => {
  assert.equal(normalizeTaskCronExpression("@DAILY"), "0 0 * * *");
  assert.equal(resolveTaskWhenCronExpression("@DAILY"), "0 0 * * *");
  assert.equal(normalizeTaskCronExpression("not-a-cron"), null);

  const invalid = normalizeTaskWhen("not-a-cron");
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.match(invalid.error, /Invalid when \(cron\)/i);
});
