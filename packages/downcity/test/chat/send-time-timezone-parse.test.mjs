/**
 * Chat send 时间参数解析测试（node:test）。
 *
 * 关键点（中文）
 * - `sendAt/sendAtMs/time` 若传 ISO 日期时间，必须带显式时区（`Z` 或 `+08:00`）。
 * - 秒级时间戳会自动归一化为毫秒。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ChatService } from "../../bin/services/chat/ChatService.js";

const chatService = new ChatService(null);

async function mapSendApiInput(payload) {
  return chatService.actions.send.api.mapInput({
    req: {
      async json() {
        return payload;
      },
    },
  });
}

test("chat send api rejects ISO datetime without timezone", async () => {
  await assert.rejects(
    mapSendApiInput({
      text: "hello",
      sendAt: "2026-03-08T10:30:00",
    }),
    /ISO datetime must include timezone offset/i,
  );
});

test("chat send api accepts timezone-aware ISO datetime", async () => {
  const result = await mapSendApiInput({
    text: "hello",
    sendAt: "2026-03-08T10:30:00+08:00",
  });
  assert.equal(result.sendAtMs, Date.parse("2026-03-08T10:30:00+08:00"));
});

test("chat send api normalizes second timestamp to milliseconds", async () => {
  const result = await mapSendApiInput({
    text: "hello",
    time: "1767225600",
  });
  assert.equal(result.sendAtMs, 1767225600 * 1000);
});
