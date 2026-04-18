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
  saveContact,
} from "../../bin/services/contact/runtime/ContactStore.js";
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

test("contact link prefers actual runtime port over configured start port", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-runtime-port-"));
  const previousServerPort = process.env.DC_SERVER_PORT;
  const previousPublicUrl = process.env.DOWNCITY_PUBLIC_URL;
  const previousPublicHost = process.env.DOWNCITY_PUBLIC_HOST;
  try {
    process.env.DC_SERVER_PORT = "7777";
    delete process.env.DOWNCITY_PUBLIC_URL;
    delete process.env.DOWNCITY_PUBLIC_HOST;
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
            port: 5314,
          },
        },
      },
      payload: {},
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpoint, "http://203.0.113.10:7777");
    assert.equal(parseContactLinkCode(result.data.code).endpoint, "http://203.0.113.10:7777");
  } finally {
    if (previousServerPort === undefined) {
      delete process.env.DC_SERVER_PORT;
    } else {
      process.env.DC_SERVER_PORT = previousServerPort;
    }
    if (previousPublicUrl === undefined) {
      delete process.env.DOWNCITY_PUBLIC_URL;
    } else {
      process.env.DOWNCITY_PUBLIC_URL = previousPublicUrl;
    }
    if (previousPublicHost === undefined) {
      delete process.env.DOWNCITY_PUBLIC_HOST;
    } else {
      process.env.DOWNCITY_PUBLIC_HOST = previousPublicHost;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("contact link prefers context public host while keeping actual runtime port", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-env-precedence-"));
  const previousServerPort = process.env.DC_SERVER_PORT;
  const previousPublicHost = process.env.DOWNCITY_PUBLIC_HOST;
  const previousPublicUrl = process.env.DOWNCITY_PUBLIC_URL;
  try {
    process.env.DC_SERVER_PORT = "7777";
    process.env.DOWNCITY_PUBLIC_HOST = "198.51.100.50";
    delete process.env.DOWNCITY_PUBLIC_URL;
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
            port: 5314,
          },
        },
      },
      payload: {},
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpoint, "http://203.0.113.10:7777");
    assert.equal(parseContactLinkCode(result.data.code).endpoint, "http://203.0.113.10:7777");
  } finally {
    if (previousServerPort === undefined) {
      delete process.env.DC_SERVER_PORT;
    } else {
      process.env.DC_SERVER_PORT = previousServerPort;
    }
    if (previousPublicHost === undefined) {
      delete process.env.DOWNCITY_PUBLIC_HOST;
    } else {
      process.env.DOWNCITY_PUBLIC_HOST = previousPublicHost;
    }
    if (previousPublicUrl === undefined) {
      delete process.env.DOWNCITY_PUBLIC_URL;
    } else {
      process.env.DOWNCITY_PUBLIC_URL = previousPublicUrl;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("contact link warns when endpoint is local-only", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-local-link-"));
  try {
    const service = new ContactService(null);
    const result = await service.actions.link.execute({
      context: {
        rootPath: root,
        env: {},
        globalEnv: {},
        config: {
          name: "local-agent",
          start: {
            host: "127.0.0.1",
            port: 5314,
          },
        },
      },
      payload: {
        endpoint: "127.0.0.1:5314",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpointReachability, "loopback");
    assert.ok(
      result.data.notes.some((item) => /same machine/.test(item) && /server agent cannot approve/.test(item)),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("contact link notes that public-looking endpoints may still be blocked", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-public-link-"));
  try {
    const service = new ContactService(null);
    const result = await service.actions.link.execute({
      context: {
        rootPath: root,
        env: {},
        globalEnv: {},
        config: {
          name: "server-agent",
          start: {
            host: "0.0.0.0",
            port: 5314,
          },
        },
      },
      payload: {
        endpoint: "203.0.113.10:5314",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.endpointReachability, "public");
    assert.ok(
      result.data.notes.some((item) => /firewall|NAT/i.test(item)),
    );
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
    assert.equal(result.data.reachability, "outbound");
    assert.ok(result.data.notes.some((item) => /outbound-only/.test(item)));

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

test("approve unwraps remote service action envelope", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-approve-envelope-"));
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
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        success: true,
        data: {
          success: true,
          agentName: "server-agent",
          endpoint: "https://agent-a.example.com",
          tokenForOwner: "local-can-call-server",
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });

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
    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].outboundToken, "local-can-call-server");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("approve confirms requester endpoint before marking contact bidirectional", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-bidirectional-"));
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
    let confirmBody = null;
    const callPaths = [];
    globalThis.fetch = async (url, init) => {
      const pathName = new URL(String(url)).pathname;
      callPaths.push(pathName);
      if (pathName === "/api/contact/confirm") {
        confirmBody = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({
          success: true,
          confirmed: true,
          reachability: "bidirectional",
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
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
        env: {},
        globalEnv: {
          DOWNCITY_PUBLIC_HOST: "203.0.113.20",
        },
        config: {
          name: "public-agent-b",
          start: {
            host: "0.0.0.0",
            port: 5314,
          },
        },
      },
      payload: {
        code,
      },
    });

    assert.equal(result.success, true);
    assert.equal(approveBody.endpoint, "http://203.0.113.20:5314");
    assert.equal(typeof approveBody.tokenForRequester, "string");
    assert.equal(approveBody.callbackOffered, true);
    assert.equal(approveBody.callbackReason, "requester-public");
    assert.equal(confirmBody.endpoint, "http://203.0.113.20:5314");
    assert.equal(confirmBody.tokenForRequester, approveBody.tokenForRequester);
    assert.deepEqual(callPaths, ["/api/contact/approve", "/api/contact/confirm"]);
    assert.equal(result.data.reachability, "bidirectional");
    assert.ok(result.data.notes.some((item) => /bidirectional/.test(item)));

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].reachability, "bidirectional");
    assert.equal(typeof contacts[0].inboundTokenHash, "string");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("approve does not offer private requester endpoint to a public target", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-local-to-public-"));
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
        env: {},
        globalEnv: {
          DOWNCITY_PUBLIC_HOST: "192.168.2.87",
        },
        config: {
          name: "local-agent-b",
          start: {
            host: "0.0.0.0",
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
    assert.equal(approveBody.callbackOffered, false);
    assert.equal(approveBody.callbackReason, "requester-not-routable-from-target");
    assert.equal(result.data.reachability, "outbound");

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].reachability, "outbound");
    assert.equal(contacts[0].inboundTokenHash, null);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("share unwraps remote service action envelope", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-share-envelope-"));
  const originalFetch = globalThis.fetch;
  try {
    const service = new ContactService(null);
    await saveContact(root, {
      id: "contact_server_agent",
      name: "server-agent",
      endpoint: "https://agent-a.example.com",
      reachability: "outbound",
      status: "trusted",
      outboundToken: "local-can-call-server",
      inboundTokenHash: null,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        success: true,
        data: {
          success: true,
          shareId: "remote_share_123",
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });

    const result = await service.actions.share.execute({
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
        to: "server-agent",
        text: "hello",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.shareId, "remote_share_123");
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

test("inbox save does not expose a partial share when file validation fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-inbox-partial-"));
  try {
    await assert.rejects(
      saveContactInboxShare(root, {
        meta: {
          id: "share_bad",
          fromContactId: "contact_alice",
          fromAgentName: "alice-agent",
          title: "bad-share",
          status: "pending",
          receivedAt: 1776173400000,
          sizeBytes: 1,
          itemCount: 1,
        },
        payload: {
          kind: "share",
          items: [
            {
              id: "item_bad",
              type: "file",
              title: "bad",
              root: "bad",
              files: [{ path: "bad.txt", sha256: "hash" }],
            },
          ],
        },
        files: [
          {
            relativePath: "../outside.txt",
            content: "bad",
          },
        ],
      }),
      /Unsafe relative path/,
    );

    const shares = await listContactInboxShares(root);
    assert.deepEqual(shares, []);
    await assert.rejects(
      fs.readFile(getContactInboxShareMetaPath(root, "share_bad"), "utf-8"),
      /ENOENT/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
