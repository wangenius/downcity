/**
 * contact service 运行时目录与 link code 测试。
 *
 * 关键点（中文）
 * - 固定“一条 contact 一个目录、一条 inbox share 一个目录”的存储契约。
 * - 固定 link code 的最小字段，避免后续实现漂移成群组/邀请模型。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getContactDirectoryPath,
  getContactInboxShareFilesPath,
  getContactInboxShareMetaPath,
  getContactInboxSharePayloadPath,
  getContactMessagesPath,
  getContactRootPath,
} from "../../bin/services/contact/runtime/Paths.js";
import {
  createContactLinkCode,
  parseContactLinkCode,
} from "../../bin/services/contact/runtime/LinkCode.js";
import {
  saveContactInboxShare,
  listContactInboxShares,
} from "../../bin/services/contact/runtime/InboxStore.js";
import { listRegisteredServiceNames } from "../../bin/main/service/ServiceClassRegistry.js";
import { SERVICE_SYSTEM_PROVIDERS } from "../../bin/main/service/ServiceSystemProviders.js";

test("contact service is registered as a root service", () => {
  assert.ok(listRegisteredServiceNames().includes("contact"));
});

test("contact service system prompt is injected through service providers", () => {
  const provider = SERVICE_SYSTEM_PROVIDERS.find((item) => item.name === "contact");
  assert.ok(provider);
  const text = provider.system({});
  assert.equal(typeof text, "string");
  assert.match(text, /contact link/);
  assert.match(text, /contact share/);
  assert.match(text, /contact check/);
  assert.match(text, /contact chat/);
  assert.match(text, /不安装 skill/);
});

test("contact runtime paths keep one contact and one chat history per contact", () => {
  const root = "/tmp/downcity-contact-demo";

  assert.equal(
    getContactRootPath(root),
    "/tmp/downcity-contact-demo/.downcity/contact",
  );
  assert.equal(
    getContactDirectoryPath(root, "contact_writer"),
    "/tmp/downcity-contact-demo/.downcity/contact/contacts/contact_writer",
  );
  assert.equal(
    getContactMessagesPath(root, "contact_writer"),
    "/tmp/downcity-contact-demo/.downcity/contact/contacts/contact_writer/messages.jsonl",
  );
  assert.equal(
    getContactInboxShareMetaPath(root, "share_p7k2m"),
    "/tmp/downcity-contact-demo/.downcity/contact/inbox/share_p7k2m/meta.json",
  );
  assert.equal(
    getContactInboxSharePayloadPath(root, "share_p7k2m"),
    "/tmp/downcity-contact-demo/.downcity/contact/inbox/share_p7k2m/payload.json",
  );
  assert.equal(
    getContactInboxShareFilesPath(root, "share_p7k2m"),
    "/tmp/downcity-contact-demo/.downcity/contact/inbox/share_p7k2m/files",
  );
});

test("contact link code encodes a point-to-point one-time link", () => {
  const code = createContactLinkCode({
    version: 1,
    linkId: "link_ab12",
    agentName: "alice-agent",
    endpoint: "http://192.168.1.10:5314",
    secret: "secret-token",
    createdAt: 1776173000000,
    expiresAt: 1776173600000,
  });

  assert.match(code, /^dc-link-v1\./);

  const parsed = parseContactLinkCode(code);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.linkId, "link_ab12");
  assert.equal(parsed.agentName, "alice-agent");
  assert.equal(parsed.endpoint, "http://192.168.1.10:5314");
  assert.equal(parsed.secret, "secret-token");
  assert.equal(parsed.expiresAt, 1776173600000);
});

test("inbox stores each share as a directory with lightweight meta and files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-inbox-"));
  try {
    await saveContactInboxShare(root, {
      meta: {
        id: "share_p7k2m",
        fromContactId: "contact_alice",
        fromAgentName: "alice-agent",
        title: "research-notes",
        status: "pending",
        receivedAt: 1776173400000,
        sizeBytes: 12,
        itemCount: 1,
      },
      payload: {
        kind: "share",
        items: [
          {
            id: "item_notes",
            type: "directory",
            title: "research-notes",
            root: "research-notes",
            files: [{ path: "SKILL.md", sha256: "hash" }],
          },
        ],
      },
      files: [
        {
          relativePath: "web-access/SKILL.md",
          content: "# web access\n",
        },
      ],
    });

    const metaPath = getContactInboxShareMetaPath(root, "share_p7k2m");
    const payloadPath = getContactInboxSharePayloadPath(root, "share_p7k2m");
    const sharedFilePath = path.join(
      getContactInboxShareFilesPath(root, "share_p7k2m"),
      "web-access",
      "SKILL.md",
    );
    const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    const payload = JSON.parse(await fs.readFile(payloadPath, "utf-8"));

    assert.equal(meta.id, "share_p7k2m");
    assert.equal(meta.status, "pending");
    assert.equal(payload.kind, "share");
    assert.equal(await fs.readFile(sharedFilePath, "utf-8"), "# web access\n");

    const shares = await listContactInboxShares(root);
    assert.deepEqual(shares.map((item) => item.id), ["share_p7k2m"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
