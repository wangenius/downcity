/**
 * Memory service system prompt 测试（node:test）。
 *
 * 关键点（中文）
 * - memory 作为独立 service，只负责注入使用规则，不直接耦合 session 执行链。
 * - agent 需要更多记忆时，应自行调用 memory service action 获取。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildMemoryServiceSystemText } from "../../bin/services/memory/runtime/SystemProvider.js";

function createContextStub(enabled = true, rootPath = process.cwd()) {
  return {
    rootPath,
    config: {
      context: {
        memory: {
          enabled,
        },
      },
    },
  };
}

test("buildMemoryServiceSystemText explains action-based memory usage", async () => {
  const text = await buildMemoryServiceSystemText(createContextStub(true));

  assert.match(text, /memory service actions/i);
  assert.match(text, /memory\.search/);
  assert.match(text, /memory\.get/);
  assert.match(text, /memory\.store/);
  assert.doesNotMatch(text, /auto recall/i);
  assert.doesNotMatch(text, /session-level working/i);
});

test("buildMemoryServiceSystemText explains disabled state", async () => {
  const text = await buildMemoryServiceSystemText(createContextStub(false));

  assert.match(text, /disabled/i);
  assert.match(text, /context\.memory\.enabled=false/);
});

test("buildMemoryServiceSystemText injects compact longterm canon memory only", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-memory-system-"));
  const memoryDir = path.join(rootPath, ".downcity", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(
    path.join(memoryDir, "MEMORY.md"),
    [
      "# MEMORY",
      "",
      "### 2026-04-07T10:00:00.000Z",
      "",
      "## 稳定偏好 / 长期规则",
      "",
      "### Canon",
      "发布说明默认简洁一点，不要太长。",
      "",
      "### 类型",
      "preference",
      "",
      "### 2026-04-07T11:00:00.000Z",
      "",
      "## 稳定偏好 / 长期规则",
      "",
      "### Canon",
      "发布说明默认简洁一点，不要太长。",
      "",
      "### 类型",
      "preference",
      "",
      "### 2026-04-07T12:00:00.000Z",
      "",
      "## 稳定偏好 / 长期规则",
      "",
      "### Canon",
      "后续构建统一使用 pnpm run build。",
      "",
      "### 类型",
      "decision",
    ].join("\n"),
    "utf-8",
  );

  const text = await buildMemoryServiceSystemText(createContextStub(true, rootPath));

  assert.match(text, /Stable Memory/i);
  assert.match(text, /发布说明默认简洁一点，不要太长。/);
  assert.match(text, /后续构建统一使用 pnpm run build。/);
  assert.doesNotMatch(text, /2026-04-07T10:00:00.000Z/);
  assert.equal(
    (text.match(/发布说明默认简洁一点，不要太长。/g) || []).length,
    1,
  );
});

test("buildMemoryServiceSystemText truncates overly long canon items", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-memory-system-"));
  const memoryDir = path.join(rootPath, ".downcity", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  const longStatement = "默认输出简洁版本，减少修饰，避免重复说明，突出变更重点。".repeat(20);
  await fs.writeFile(
    path.join(memoryDir, "MEMORY.md"),
    [
      "# MEMORY",
      "",
      "### 2026-04-07T10:00:00.000Z",
      "",
      "## 稳定偏好 / 长期规则",
      "",
      "### Canon",
      longStatement,
      "",
      "### 类型",
      "preference",
    ].join("\n"),
    "utf-8",
  );

  const text = await buildMemoryServiceSystemText(createContextStub(true, rootPath));

  assert.match(text, /Stable Memory/i);
  assert.ok(text.length < longStatement.length);
  assert.match(text, /\.\.\./);
});
