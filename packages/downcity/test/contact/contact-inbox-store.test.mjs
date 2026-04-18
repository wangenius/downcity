/**
 * contact inbox 状态一致性测试。
 *
 * 关键点（中文）
 * - inbox 列表状态只能在 received 区完整写入后更新。
 * - 失败路径不能把 pending share 标成 received。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  markContactInboxShareReceived,
  readContactInboxShareMeta,
  saveContactInboxShare,
} from "../../bin/services/contact/runtime/InboxStore.js";
import {
  getContactReceivedSharePath,
} from "../../bin/services/contact/runtime/Paths.js";

test("inbox receive keeps share pending when received meta cannot be written", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-receive-partial-"));
  try {
    await saveContactInboxShare(root, {
      meta: {
        id: "share_receive_bad",
        fromContactId: "contact_alice",
        fromAgentName: "alice-agent",
        title: "receive-bad",
        status: "pending",
        receivedAt: 1776173400000,
        sizeBytes: 0,
        itemCount: 1,
      },
      payload: {
        kind: "share",
        items: [
          {
            id: "item_text",
            type: "text",
            title: "Text",
            text: "hello",
          },
        ],
      },
      files: [],
    });
    await fs.mkdir(
      path.join(getContactReceivedSharePath(root, "share_receive_bad"), "meta.json"),
      { recursive: true },
    );

    await assert.rejects(
      markContactInboxShareReceived(root, "share_receive_bad"),
      /EISDIR|illegal operation|is a directory/i,
    );

    const meta = await readContactInboxShareMeta(root, "share_receive_bad");
    assert.equal(meta.status, "pending");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
