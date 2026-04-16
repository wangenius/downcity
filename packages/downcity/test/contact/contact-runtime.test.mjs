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
  resolveContactSelfEndpoint,
} from "../../bin/services/contact/runtime/EndpointResolver.js";
import {
  saveContactInboxShare,
  listContactInboxShares,
} from "../../bin/services/contact/runtime/InboxStore.js";
import {
  listContacts,
} from "../../bin/services/contact/runtime/ContactStore.js";
import {
  saveContactLinkRecord,
} from "../../bin/services/contact/runtime/LinkStore.js";
import {
  hashContactToken,
} from "../../bin/services/contact/runtime/Token.js";
import { ContactService } from "../../bin/services/contact/ContactService.js";
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

test("contact link resolves endpoint from runtime public URL without user option", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-link-"));
  const previousPublicUrl = process.env.DOWNCITY_PUBLIC_URL;
  try {
    process.env.DOWNCITY_PUBLIC_URL = "https://agent-a.example.com";
    const service = new ContactService(null);
    const result = await service.actions.link.execute({
      context: {
        rootPath: root,
        config: {
          name: "server-agent",
          start: {
            host: "0.0.0.0",
            port: 8787,
          },
        },
      },
      payload: {},
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpoint, "https://agent-a.example.com");
    assert.equal(parseContactLinkCode(result.data.code).endpoint, "https://agent-a.example.com");
  } finally {
    if (previousPublicUrl === undefined) {
      delete process.env.DOWNCITY_PUBLIC_URL;
    } else {
      process.env.DOWNCITY_PUBLIC_URL = previousPublicUrl;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("contact link resolves endpoint from context global env", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-global-env-"));
  try {
    const service = new ContactService(null);
    const result = await service.actions.link.execute({
      context: {
        rootPath: root,
        env: {},
        globalEnv: {
          DOWNCITY_PUBLIC_HOST: "203.0.113.10",
        },
        config: {
          name: "server-agent",
          start: {
            host: "0.0.0.0",
            port: 8787,
          },
        },
      },
      payload: {},
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpoint, "http://203.0.113.10:8787");
    assert.equal(parseContactLinkCode(result.data.code).endpoint, "http://203.0.113.10:8787");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("contact endpoint resolver discovers public ip before falling back to localhost", async () => {
  const endpoint = await resolveContactSelfEndpoint({
    host: "0.0.0.0",
    port: 5314,
    env: {},
    interfaces: {},
    resolvePublicIpv4: async () => "72.62.254.79",
  });

  assert.equal(endpoint, "http://72.62.254.79:5314");
});

test("remote approve allows an inbound-only contact without requester endpoint", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-oneway-"));
  try {
    const service = new ContactService(null);
    const context = {
      rootPath: root,
      config: {
        name: "server-agent",
        start: {
          host: "0.0.0.0",
          port: 8787,
        },
      },
    };
    await saveContactLinkRecord(root, {
      id: "link_oneway",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: null,
    });

    const result = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_oneway",
        secret: "secret-token",
        agentName: "local-agent",
        tokenForRequester: "server-cannot-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, "local-agent");
    assert.equal(contacts[0].endpoint, null);
    assert.equal(contacts[0].reachability, "inbound");
    assert.equal(contacts[0].outboundToken, null);
    assert.equal(typeof contacts[0].inboundTokenHash, "string");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("approve without endpoint creates an outbound-only local contact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-approve-"));
  const originalFetch = globalThis.fetch;
  try {
    const service = new ContactService(null);
    const code = createContactLinkCode({
      version: 1,
      linkId: "link_server",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secret: "secret-token",
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
    });
    let approveBody = null;
    globalThis.fetch = async (_url, init) => {
      approveBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({
        success: true,
        agentName: "server-agent",
        endpoint: "https://agent-a.example.com",
        tokenForOwner: "local-can-call-server",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    const result = await service.actions.approve.execute({
      context: {
        rootPath: root,
        config: {
          name: "local-agent",
          start: {
            host: "127.0.0.1",
            port: 5314,
          },
        },
      },
      payload: {
        code,
      },
    });

    assert.equal(result.success, true);
    assert.equal(approveBody.endpoint, undefined);
    assert.equal(approveBody.tokenForRequester, undefined);

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, "server-agent");
    assert.equal(contacts[0].endpoint, "https://agent-a.example.com");
    assert.equal(contacts[0].reachability, "outbound");
    assert.equal(contacts[0].outboundToken, "local-can-call-server");
    assert.equal(contacts[0].inboundTokenHash, null);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
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
