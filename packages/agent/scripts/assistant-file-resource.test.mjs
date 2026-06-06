/**
 * @file 验证 assistant file part 会把 data URL 资源落盘为 file:// URL。
 *
 * 关键点（中文）
 * - 历史消息不应长期保存图片 base64。
 * - 送模型前可以从 file:// 临时 hydrate 回 data URL。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { materializeAssistantFileParts } from "../bin/executor/messages/AssistantFileResource.js";
import { hydrateFileUrlPartsForModel } from "../bin/executor/messages/SessionAttachmentMapper.js";

test("materializeAssistantFileParts stores data URL images under .downcity/resources", async () => {
  const project_root = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-assistant-resource-"),
  );
  const bytes = Buffer.from("png-bytes-for-test", "utf8");
  const data_url = `data:image/png;base64,${bytes.toString("base64")}`;

  const parts = await materializeAssistantFileParts({
    projectRoot: project_root,
    parts: [
      {
        type: "file",
        mediaType: "image/png",
        filename: "image-1.png",
        url: data_url,
      },
    ],
  });

  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, "file");
  assert.equal(parts[0].mediaType, "image/png");
  assert.equal(parts[0].filename, "image-1.png");
  assert.match(parts[0].url, /^file:\/\//);
  assert.equal(parts[0].url.includes("base64"), false);

  const resource_path = fileURLToPath(parts[0].url);
  assert.equal(
    path.dirname(resource_path),
    path.join(project_root, ".downcity", "resources"),
  );
  assert.deepEqual(await fs.readFile(resource_path), bytes);
});

test("hydrateFileUrlPartsForModel converts persisted file URLs back to data URLs in memory", async () => {
  const project_root = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-assistant-hydrate-"),
  );
  const bytes = Buffer.from("hydrate-bytes-for-test", "utf8");
  const materialized = await materializeAssistantFileParts({
    projectRoot: project_root,
    parts: [
      {
        type: "file",
        mediaType: "image/png",
        filename: "image-1.png",
        url: `data:image/png;base64,${bytes.toString("base64")}`,
      },
    ],
  });

  const messages = await hydrateFileUrlPartsForModel([
    {
      id: "a:test:1",
      role: "assistant",
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId: "session_test",
      },
      parts: materialized,
    },
  ]);

  const hydrated_part = messages[0]?.parts[0];
  assert.equal(hydrated_part?.type, "file");
  assert.equal(hydrated_part?.mediaType, "image/png");
  assert.equal(
    hydrated_part?.url,
    `data:image/png;base64,${bytes.toString("base64")}`,
  );
  assert.match(materialized[0].url, /^file:\/\//);
});
