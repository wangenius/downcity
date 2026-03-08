/**
 * Task 调度时间规则测试（node:test）。
 *
 * 关键点（中文）
 * - `time` 必须是带显式时区的 ISO8601 日期时间。
 * - `time` 只允许与 `cron=@manual` 组合，避免双调度歧义。
 * - `timezone` 仅允许 IANA 时区。
 * - cron alias 需归一化并拒绝非法表达式。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTaskCron,
  normalizeTaskTime,
  normalizeTaskTimezone,
  validateTaskScheduleCombination,
} from "../../bin/services/task/runtime/model.js";

test("normalizeTaskTime rejects ISO datetime without explicit timezone", () => {
  const result = normalizeTaskTime("2026-03-08T10:30:00");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /with timezone/i);
});

test("normalizeTaskTime normalizes timezone-aware datetime to UTC ISO", () => {
  const result = normalizeTaskTime("2026-03-08T10:30:00+08:00");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value, "2026-03-08T02:30:00.000Z");
});

test("validateTaskScheduleCombination rejects time with non-manual cron", () => {
  const result = validateTaskScheduleCombination({
    cron: "0 * * * *",
    time: "2026-03-08T02:30:00.000Z",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /requires `cron=@manual`/i);
});

test("validateTaskScheduleCombination accepts time with manual cron alias", () => {
  const result = validateTaskScheduleCombination({
    cron: "@MANUAL",
    time: "2026-03-08T02:30:00.000Z",
  });
  assert.equal(result.ok, true);
});

test("normalizeTaskTimezone accepts valid IANA timezone and rejects invalid value", () => {
  const good = normalizeTaskTimezone("Asia/Shanghai");
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.value, "Asia/Shanghai");
  }

  const bad = normalizeTaskTimezone("UTC+8");
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.match(bad.error, /Invalid timezone/i);
});

test("normalizeTaskCron normalizes alias and rejects invalid expression", () => {
  const alias = normalizeTaskCron("@DAILY");
  assert.equal(alias.ok, true);
  if (alias.ok) {
    assert.equal(alias.value, "@daily");
  }

  const invalid = normalizeTaskCron("not-a-cron");
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.match(invalid.error, /Invalid cron/i);
});
