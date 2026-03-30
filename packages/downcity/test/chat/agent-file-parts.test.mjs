/**
 * Agent file parts 注入测试（node:test）。
 *
 * 关键点（中文）
 * - `<file type="document">...pdf</file>` 会注入为模型可读的 PDF file part。
 * - 原始 `<file>` 文本仍然保留，兼容纯文本模型与日志审计。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { toModelMessages } from "../../bin/sessions/helpers/SessionHelpers.js";

test("toModelMessages injects pdf file parts from <file> tags", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-agent-pdf-"));
  const pdfPath = path.join(tempDir, "brief.pdf");
  await fs.writeFile(pdfPath, "%PDF-1.4 test");

  try {
    const messages = [
      {
        id: "msg_001",
        role: "user",
        parts: [
          {
            type: "text",
            text: `<file type="document">${pdfPath}</file>\n\n请总结这个 PDF`,
          },
        ],
        metadata: {
          v: 1,
          ts: Date.now(),
          contextId: "ctx_demo",
        },
      },
    ];

    const output = await toModelMessages(messages, {});
    assert.equal(output.length, 1);
    assert.equal(output[0].role, "user");
    assert.ok(Array.isArray(output[0].content));
    assert.deepEqual(output[0].content[0], {
      type: "text",
      text: `<file type="document">${pdfPath}</file>\n\n请总结这个 PDF`,
    });
    assert.equal(output[0].content[1].type, "file");
    assert.equal(output[0].content[1].mediaType, "application/pdf");
    assert.equal(output[0].content[1].filename, "brief.pdf");
    assert.match(output[0].content[1].data, /^data:application\/pdf;base64,/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
