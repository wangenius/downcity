/**
 * BaseChatChannel 工具侧语义测试（node:test）。
 *
 * 关键点（中文）
 * - `sendToolText` 对空文本应视为 no-op，不调用平台发送。
 * - `sendToolAction` 在未实现 action 能力时，应返回明确的 not supported。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { BaseChatChannel } from "../../bin/services/chat/channels/BaseChatChannel.js";

function createRuntime() {
  return {
    rootPath: "/tmp/downcity-base-chat-channel-test",
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

class StubChannel extends BaseChatChannel {
  sentTexts = [];

  constructor() {
    super({
      channel: "telegram",
      context: createRuntime(),
    });
  }

  getChatKey(params) {
    return `stub:${params.chatId}`;
  }

  async sendTextToPlatform(params) {
    this.sentTexts.push(params);
  }
}

test("BaseChatChannel sendToolText treats blank text as noop", async () => {
  const channel = new StubChannel();

  const result = await channel.sendToolText({
    chatId: "chat_1",
    text: "   ",
  });

  assert.equal(result.success, true);
  assert.equal(channel.sentTexts.length, 0);
});

test("BaseChatChannel sendToolAction returns not supported when platform action is missing", async () => {
  const channel = new StubChannel();

  const result = await channel.sendToolAction({
    chatId: "chat_2",
    action: "typing",
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "sendAction not supported");
});
