/**
 * Feishu 入站附件解析测试（node:test）。
 *
 * 关键点（中文）
 * - 图片/文件/视频消息能够归一化成统一附件描述。
 * - 本地缓存文件名会优先使用响应头里的文件名，并补齐扩展名。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeishuInboundCacheFileName,
  parseFeishuInboundMessage,
} from "../../bin/services/chat/channels/feishu/InboundAttachment.js";

test("parseFeishuInboundMessage keeps text body for text messages", () => {
  const parsed = parseFeishuInboundMessage({
    messageType: "text",
    content: JSON.stringify({ text: "你好，帮我总结这张图" }),
  });

  assert.equal(parsed.text, "你好，帮我总结这张图");
  assert.deepEqual(parsed.attachments, []);
  assert.equal(parsed.unsupportedType, undefined);
});

test("parseFeishuInboundMessage normalizes image/file/media attachments", () => {
  const image = parseFeishuInboundMessage({
    messageType: "image",
    content: JSON.stringify({ image_key: "img_001" }),
  });
  assert.equal(image.attachments.length, 1);
  assert.deepEqual(image.attachments[0], {
    type: "photo",
    resourceType: "image",
    resourceKey: "img_001",
    fileName: "image",
    description: "image",
    raw: {
      resourceKey: "img_001",
      imageKey: "img_001",
    },
  });

  const file = parseFeishuInboundMessage({
    messageType: "file",
    content: JSON.stringify({
      file_key: "file_001",
      file_name: "设计说明.pdf",
    }),
  });
  assert.equal(file.attachments.length, 1);
  assert.equal(file.attachments[0].type, "document");
  assert.equal(file.attachments[0].resourceType, "file");
  assert.equal(file.attachments[0].resourceKey, "file_001");
  assert.equal(file.attachments[0].fileName, "设计说明.pdf");

  const media = parseFeishuInboundMessage({
    messageType: "media",
    content: JSON.stringify({
      file_key: "media_001",
      file_name: "demo.mp4",
      image_key: "img_preview_001",
      duration: 12,
    }),
  });
  assert.equal(media.attachments.length, 1);
  assert.equal(media.attachments[0].type, "video");
  assert.equal(media.attachments[0].resourceType, "media");
  assert.equal(media.attachments[0].resourceKey, "media_001");
  assert.equal(media.attachments[0].raw.imageKey, "img_preview_001");
  assert.equal(media.attachments[0].raw.duration, 12);
});

test("buildFeishuInboundCacheFileName prefers content-disposition name", () => {
  const fileName = buildFeishuInboundCacheFileName({
    messageId: "om_123456789",
    attachment: {
      type: "document",
      resourceType: "file",
      resourceKey: "file_001",
      fileName: "fallback-name",
      raw: {
        resourceKey: "file_001",
      },
    },
    headers: {
      "content-disposition":
        "attachment; filename*=UTF-8''%E9%A3%9E%E4%B9%A6%E6%96%87%E6%A1%A3.pdf",
      "content-type": "application/pdf",
    },
  });

  assert.match(fileName, /^\d+-om_123456789-/);
  assert.ok(fileName.endsWith("-飞书文档.pdf"));
});
