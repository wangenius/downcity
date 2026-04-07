/**
 * SessionMemoryRuntime 规则测试（node:test）。
 *
 * 关键点（中文）
 * - capture 应始终写 working。
 * - capture 应追加一份 daily journal。
 * - 只有检测到稳定偏好 / 长期规则时才写 longterm。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyMemoryCaptureContent,
  buildLongtermCandidate,
  buildLongtermMemoryCaptureContent,
  createLocalSessionMemoryRuntime,
} from "../../bin/session/executors/local/SessionMemoryRuntime.js";

function createContextStub(calls, options = {}) {
  return {
    logger: {
      async log() {},
    },
    invoke: {
      async invoke(params) {
        calls.push(params);
        if (typeof options.onInvoke === "function") {
          return await options.onInvoke(params);
        }
        return { success: true, data: {} };
      },
    },
  };
}

test("buildDailyMemoryCaptureContent builds a journal-style daily entry", () => {
  const content = buildDailyMemoryCaptureContent({
    sessionId: "chat-1",
    query: "给我写一版发布说明",
    assistantText: "这是今天的发布说明草稿。",
  });

  assert.match(content, /会话：chat-1/);
  assert.match(content, /### 用户/);
  assert.match(content, /### 助手/);
});

test("buildLongtermMemoryCaptureContent returns empty for ordinary task turns", () => {
  const content = buildLongtermMemoryCaptureContent({
    sessionId: "chat-1",
    query: "给我写一版发布说明",
    assistantText: "这是今天的发布说明草稿。",
  });

  assert.equal(content, "");
});

test("buildLongtermMemoryCaptureContent extracts stable preference turns", () => {
  const candidate = buildLongtermCandidate({
    sessionId: "chat-1",
    query: "记住：以后发布说明默认简洁一点，不要太长。",
    assistantText: "好的，后续默认使用简洁版发布说明。",
  });
  assert.equal(candidate?.kind, "preference");
  assert.equal(candidate?.statement, "发布说明默认简洁一点，不要太长。");

  const content = buildLongtermMemoryCaptureContent({
    sessionId: "chat-1",
    query: "记住：以后发布说明默认简洁一点，不要太长。",
    assistantText: "好的，后续默认使用简洁版发布说明。",
  });

  assert.match(content, /稳定偏好/);
  assert.match(content, /发布说明默认简洁一点，不要太长。/);
  assert.doesNotMatch(content, /记住：/);
});

test("buildLongtermCandidate extracts stable fact turns", () => {
  const candidate = buildLongtermCandidate({
    sessionId: "chat-1",
    query: "记住：这个项目主要语言是 TypeScript。",
    assistantText: "好的，我记住这个项目主要语言是 TypeScript。",
  });

  assert.equal(candidate?.kind, "fact");
  assert.equal(candidate?.statement, "这个项目主要语言是 TypeScript。");
});

test("buildLongtermCandidate extracts current effective decision turns", () => {
  const candidate = buildLongtermCandidate({
    sessionId: "chat-1",
    query: "决定一下：后续构建统一使用 pnpm run build。",
    assistantText: "好的，后续构建统一使用 pnpm run build。",
  });

  assert.equal(candidate?.kind, "decision");
  assert.equal(candidate?.statement, "后续构建统一使用 pnpm run build。");
});

test("createLocalSessionMemoryRuntime.capture writes working and daily by default", async () => {
  const calls = [];
  const runtime = createLocalSessionMemoryRuntime({
    getContext: () => createContextStub(calls),
  });

  await runtime.capture({
    sessionId: "chat-1",
    query: "给我写一版发布说明",
    assistantText: "这是今天的发布说明草稿。",
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((item) => item.payload.target),
    ["working", "daily"],
  );
});

test("createLocalSessionMemoryRuntime.capture also writes longterm for stable preference turns", async () => {
  const calls = [];
  const runtime = createLocalSessionMemoryRuntime({
    getContext: () => createContextStub(calls),
  });

  await runtime.capture({
    sessionId: "chat-1",
    query: "记住：以后发布说明默认简洁一点，不要太长。",
    assistantText: "好的，后续默认使用简洁版发布说明。",
  });

  assert.deepEqual(
    calls
      .filter((item) => item.action === "store")
      .map((item) => item.payload.target),
    ["working", "daily", "longterm"],
  );
});

test("createLocalSessionMemoryRuntime.capture skips duplicate longterm entries", async () => {
  const calls = [];
  const runtime = createLocalSessionMemoryRuntime({
    getContext: () =>
      createContextStub(calls, {
        async onInvoke(params) {
          if (params.action === "get") {
            return {
              success: true,
              data: {
                path: ".downcity/memory/MEMORY.md",
                text: [
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
                ].join("\n"),
              },
            };
          }
          return { success: true, data: {} };
        },
      }),
  });

  await runtime.capture({
    sessionId: "chat-1",
    query: "记住：以后发布说明默认简洁一点，不要太长。",
    assistantText: "好的，后续默认使用简洁版发布说明。",
  });

  assert.deepEqual(
    calls
      .filter((item) => item.action === "store")
      .map((item) => item.payload.target),
    ["working", "daily"],
  );
});
