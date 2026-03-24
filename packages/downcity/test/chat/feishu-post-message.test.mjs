/**
 * Feishu `post` 富文本消息测试（node:test）。
 *
 * 关键点（中文）
 * - 入站 `post` 会被解析成“纯文本 + 可下载附件”。
 * - 出站多行正文与图片会组装成飞书 `post` payload。
 * - 普通单行文本仍保持 `text` 发送，减少不必要的平台语义变化。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFeishuPostMessageContent,
  parseFeishuPostMessageContent,
  shouldUseFeishuPostMessage,
} from "../../bin/services/chat/channels/feishu/PostMessage.js";
import { FeishuBot } from "../../bin/services/chat/channels/feishu/Feishu.js";

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
    },
  };
}

test("parseFeishuPostMessageContent extracts text, links, mentions and images", () => {
  const parsed = parseFeishuPostMessageContent({
    content: JSON.stringify({
      zh_cn: {
        title: "提醒我",
        content: [
          [
            { tag: "text", text: "明天下午喝个咖啡？" },
          ],
          [
            { tag: "text", text: "blue frog 蓝蛙" },
            { tag: "a", text: "门店链接", href: "https://example.com/store" },
          ],
          [
            { tag: "img", image_key: "img_001", alt: "地图" },
          ],
          [
            { tag: "at", user_id: "all" },
            { tag: "text", text: " 2点？" },
          ],
        ],
      },
    }),
  });

  assert.equal(
    parsed.text,
    "提醒我\n\n明天下午喝个咖啡？\nblue frog 蓝蛙门店链接 (https://example.com/store)\n[图片: 地图]\n@all 2点？",
  );
  assert.equal(parsed.attachments.length, 1);
  assert.deepEqual(parsed.attachments[0], {
    type: "photo",
    resourceType: "image",
    resourceKey: "img_001",
    fileName: "地图",
    description: "地图",
    raw: {
      resourceKey: "img_001",
      imageKey: "img_001",
      fileName: "地图",
    },
  });
});

test("buildFeishuPostMessageContent converts links and inline images to post payload", () => {
  const payload = buildFeishuPostMessageContent({
    text: "明天下午喝个咖啡？\n[门店链接](https://example.com/store)\n2点？",
    inlineImages: [
      {
        imageKey: "img_uploaded_001",
        caption: "blue frog 蓝蛙(恒丰路店)",
      },
    ],
  });

  assert.ok(payload);
  const parsed = JSON.parse(payload);
  assert.deepEqual(parsed.zh_cn.content[0], [
    { tag: "text", text: "明天下午喝个咖啡？" },
  ]);
  assert.deepEqual(parsed.zh_cn.content[1], [
    { tag: "a", text: "门店链接", href: "https://example.com/store" },
  ]);
  assert.deepEqual(parsed.zh_cn.content[3], [
    { tag: "img", image_key: "img_uploaded_001" },
  ]);
  assert.deepEqual(parsed.zh_cn.content[4], [
    { tag: "text", text: "blue frog 蓝蛙(恒丰路店)" },
  ]);
  assert.deepEqual(parsed.en_us, parsed.zh_cn);
});

test("shouldUseFeishuPostMessage only enables post for structured content", () => {
  assert.equal(
    shouldUseFeishuPostMessage({
      text: "普通单行文本",
    }),
    false,
  );
  assert.equal(
    shouldUseFeishuPostMessage({
      text: "第一行\n第二行",
    }),
    true,
  );
  assert.equal(
    shouldUseFeishuPostMessage({
      text: "查看 https://example.com",
    }),
    true,
  );
});

test("FeishuBot sends multiline text and photos as post", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-feishu-post-"));
  const runtime = buildRuntime(rootPath);
  const bot = new FeishuBot(runtime, "app-id", "app-secret", undefined);
  const calls = [];

  bot.sendPlatformMessage = async (chatId, chatType, messageId, msgType, content) => {
    calls.push({
      chatId,
      chatType,
      messageId,
      msgType,
      content,
    });
  };
  bot.resolveAttachmentLocalPath = async () => "/tmp/fixture-map.png";
  bot.uploadImageToFeishu = async () => "img_uploaded_002";

  try {
    await bot.sendChatMessage(
      "oc_xxx",
      "group",
      [
        "明天下午喝个咖啡？",
        "2点？",
        "",
        '<file type="photo" caption="门店位置图">fixtures/map.png</file>',
      ].join("\n"),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].msgType, "post");
    const payload = JSON.parse(calls[0].content);
    assert.deepEqual(payload.zh_cn.content[0], [
      { tag: "text", text: "明天下午喝个咖啡？" },
    ]);
    assert.deepEqual(payload.zh_cn.content[1], [
      { tag: "text", text: "2点？" },
    ]);
    assert.ok(
      payload.zh_cn.content.some(
        (line) =>
          Array.isArray(line) &&
          line.some(
            (item) =>
              item &&
              item.tag === "img" &&
              item.image_key === "img_uploaded_002",
          ),
      ),
    );
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

test("FeishuBot keeps plain single-line text as text message", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-feishu-text-"));
  const runtime = buildRuntime(rootPath);
  const bot = new FeishuBot(runtime, "app-id", "app-secret", undefined);
  const calls = [];

  bot.sendPlatformMessage = async (chatId, chatType, messageId, msgType, content) => {
    calls.push({
      chatId,
      chatType,
      messageId,
      msgType,
      content,
    });
  };

  try {
    await bot.sendChatMessage("oc_xxx", "group", "普通单行文本");
    assert.deepEqual(calls, [
      {
        chatId: "oc_xxx",
        chatType: "group",
        messageId: undefined,
        msgType: "text",
        content: {
          text: "普通单行文本",
        },
      },
    ]);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
