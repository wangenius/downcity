/**
 * contact link approve / confirm 状态迁移测试。
 *
 * 关键点（中文）
 * - 固定 approve、confirm、重试和失败路径中的最终 contact/link 状态。
 * - callback 只是双向升级候选，不能破坏基础单向建联。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listContacts,
  saveContact,
} from "../../bin/services/contact/runtime/ContactStore.js";
import {
  readContactLinkRecord,
  saveContactLinkRecord,
} from "../../bin/services/contact/runtime/LinkStore.js";
import {
  hashContactToken,
} from "../../bin/services/contact/runtime/Token.js";
import { ContactService } from "../../bin/services/contact/ContactService.js";

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

test("remote approve treats private requester endpoint as inbound-only", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-private-requester-"));
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
      id: "link_private",
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
        linkId: "link_private",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://192.168.2.87:5314",
        tokenForRequester: "server-cannot-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].endpoint, null);
    assert.equal(contacts[0].reachability, "inbound");
    assert.equal(contacts[0].outboundToken, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve ignores malformed callback data and still creates inbound contact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-bad-callback-"));
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
      id: "link_bad_callback",
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
        linkId: "link_bad_callback",
        secret: "secret-token",
        agentName: "local-agent",
        callbackOffered: true,
        callbackReason: "requester-public",
        endpoint: "http://203.0.113.20:5314",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(typeof result.data.tokenForOwner, "string");

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].endpoint, null);
    assert.equal(contacts[0].reachability, "inbound");
    assert.equal(contacts[0].outboundToken, null);
    const link = await readContactLinkRecord(root, "link_bad_callback");
    assert.equal(link.tokenForRequester, null);
    assert.equal(link.approvedEndpoint, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote confirm upgrades inbound contact only after callback ping succeeds", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-confirm-"));
  const originalFetch = globalThis.fetch;
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
      id: "link_confirm",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "server-can-call-local",
    });
    await saveContact(root, {
      id: "contact_local_agent",
      name: "local-agent",
      endpoint: null,
      reachability: "inbound",
      status: "trusted",
      outboundToken: null,
      inboundTokenHash: hashContactToken("local-can-call-server"),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        success: true,
        agentName: "local-agent",
        authenticated: true,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });

    const result = await service.actions.remoteconfirm.execute({
      context,
      payload: {
        linkId: "link_confirm",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://203.0.113.20:5314",
        tokenForRequester: "server-can-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(result.data.confirmed, true);

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].endpoint, "http://203.0.113.20:5314");
    assert.equal(contacts[0].reachability, "bidirectional");
    assert.equal(contacts[0].outboundToken, "server-can-call-local");
    assert.equal(typeof contacts[0].inboundTokenHash, "string");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote confirm still works after an approved link expires", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-confirm-expired-"));
  const originalFetch = globalThis.fetch;
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
      id: "link_confirm_expired",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now() - 700_000,
      expiresAt: Date.now() - 100_000,
      usedAt: Date.now() - 120_000,
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "server-can-call-local",
    });
    await saveContact(root, {
      id: "contact_local_agent",
      name: "local-agent",
      endpoint: null,
      reachability: "inbound",
      status: "trusted",
      outboundToken: null,
      inboundTokenHash: hashContactToken("local-can-call-server"),
      createdAt: Date.now() - 120_000,
      lastSeenAt: Date.now() - 120_000,
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        success: true,
        agentName: "local-agent",
        authenticated: true,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });

    const result = await service.actions.remoteconfirm.execute({
      context,
      payload: {
        linkId: "link_confirm_expired",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://203.0.113.20:5314",
        tokenForRequester: "server-can-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(result.data.confirmed, true);
    const contacts = await listContacts(root);
    assert.equal(contacts[0].reachability, "bidirectional");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote confirm repairs link state when contact was already upgraded", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-confirm-repair-"));
  const originalFetch = globalThis.fetch;
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
      id: "link_confirm_repair",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "server-can-call-local",
      confirmedAt: null,
    });
    await saveContact(root, {
      id: "contact_local_agent",
      name: "local-agent",
      endpoint: "http://203.0.113.20:5314",
      reachability: "bidirectional",
      status: "trusted",
      outboundToken: "server-can-call-local",
      inboundTokenHash: hashContactToken("local-can-call-server"),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    let pingCalled = false;
    globalThis.fetch = async () => {
      pingCalled = true;
      return new Response(JSON.stringify({
        success: true,
        agentName: "local-agent",
        authenticated: true,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    const result = await service.actions.remoteconfirm.execute({
      context,
      payload: {
        linkId: "link_confirm_repair",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://203.0.113.20:5314",
        tokenForRequester: "server-can-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(result.data.confirmed, true);
    assert.equal(pingCalled, false);
    const link = await readContactLinkRecord(root, "link_confirm_repair");
    assert.equal(typeof link.confirmedAt, "number");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote confirm rejects a callback token that was not approved", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-confirm-token-"));
  const originalFetch = globalThis.fetch;
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
      id: "link_confirm_token",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "approved-callback-token",
    });
    await saveContact(root, {
      id: "contact_local_agent",
      name: "local-agent",
      endpoint: null,
      reachability: "inbound",
      status: "trusted",
      outboundToken: null,
      inboundTokenHash: hashContactToken("local-can-call-server"),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    let pingCalled = false;
    globalThis.fetch = async () => {
      pingCalled = true;
      return new Response(JSON.stringify({
        success: true,
        agentName: "local-agent",
        authenticated: true,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    const result = await service.actions.remoteconfirm.execute({
      context,
      payload: {
        linkId: "link_confirm_token",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://203.0.113.20:5314",
        tokenForRequester: "different-callback-token",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, false);
    assert.match(result.data.error, /callback token/i);
    assert.equal(pingCalled, false);
    const contacts = await listContacts(root);
    assert.equal(contacts[0].reachability, "inbound");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote confirm rejects a callback endpoint that was not approved", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-confirm-endpoint-"));
  const originalFetch = globalThis.fetch;
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
      id: "link_confirm_endpoint",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "server-can-call-local",
    });
    await saveContact(root, {
      id: "contact_local_agent",
      name: "local-agent",
      endpoint: null,
      reachability: "inbound",
      status: "trusted",
      outboundToken: null,
      inboundTokenHash: hashContactToken("local-can-call-server"),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    let pingCalled = false;
    globalThis.fetch = async () => {
      pingCalled = true;
      return new Response(JSON.stringify({
        success: true,
        agentName: "local-agent",
        authenticated: true,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    const result = await service.actions.remoteconfirm.execute({
      context,
      payload: {
        linkId: "link_confirm_endpoint",
        secret: "secret-token",
        agentName: "local-agent",
        endpoint: "http://203.0.113.21:5314",
        tokenForRequester: "server-can-call-local",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, false);
    assert.match(result.data.error, /callback endpoint/i);
    assert.equal(pingCalled, false);
    const contacts = await listContacts(root);
    assert.equal(contacts[0].reachability, "inbound");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve retry refreshes unconfirmed callback metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-refresh-callback-"));
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
      id: "link_refresh_callback",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "old-callback-token",
    });

    const result = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_refresh_callback",
        secret: "secret-token",
        agentName: "local-agent",
        callbackOffered: true,
        callbackReason: "requester-public",
        endpoint: "http://203.0.113.21:5314",
        tokenForRequester: "new-callback-token",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(result.data.tokenForOwner, "local-can-call-server");
    const link = await readContactLinkRecord(root, "link_refresh_callback");
    assert.equal(link.tokenForRequester, "new-callback-token");
    assert.equal(link.approvedEndpoint, "http://203.0.113.21:5314");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve retry without callback keeps existing unconfirmed callback metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-keep-callback-"));
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
      id: "link_keep_callback",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: "http://203.0.113.20:5314",
      tokenForOwner: "local-can-call-server",
      tokenForRequester: "existing-callback-token",
    });

    const result = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_keep_callback",
        secret: "secret-token",
        agentName: "local-agent",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    const link = await readContactLinkRecord(root, "link_keep_callback");
    assert.equal(link.tokenForRequester, "existing-callback-token");
    assert.equal(link.approvedEndpoint, "http://203.0.113.20:5314");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve can be retried by the same agent after the owner saved inbound contact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-retry-"));
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
      id: "link_retry",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: null,
    });

    const first = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_retry",
        secret: "secret-token",
        agentName: "local-agent",
      },
    });
    const second = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_retry",
        secret: "secret-token",
        agentName: "local-agent",
      },
    });

    assert.equal(first.success, true);
    assert.equal(first.data.success, true);
    assert.equal(second.success, true);
    assert.equal(second.data.success, true);
    assert.equal(second.data.tokenForOwner, first.data.tokenForOwner);

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].reachability, "inbound");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve retry repairs the owner contact from the used link", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-repair-approve-"));
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
      id: "link_repair_approve",
      agentName: "server-agent",
      endpoint: "https://agent-a.example.com",
      secretHash: hashContactToken("secret-token"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      usedAt: Date.now(),
      approvedAgentName: "local-agent",
      approvedEndpoint: null,
      tokenForOwner: "local-can-call-server",
      tokenForRequester: null,
    });

    const result = await service.actions.remoteapprove.execute({
      context,
      payload: {
        linkId: "link_repair_approve",
        secret: "secret-token",
        agentName: "local-agent",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, true);
    assert.equal(result.data.tokenForOwner, "local-can-call-server");

    const contacts = await listContacts(root);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, "local-agent");
    assert.equal(contacts[0].reachability, "inbound");
    assert.equal(contacts[0].inboundTokenHash, hashContactToken("local-can-call-server"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remote approve explains missing link records separately from expiration", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-contact-missing-link-"));
  try {
    const service = new ContactService(null);
    const result = await service.actions.remoteapprove.execute({
      context: {
        rootPath: root,
        env: {
          DOWNCITY_PUBLIC_URL: "https://agent-a.example.com",
        },
        config: {
          name: "server-agent",
          start: {
            host: "0.0.0.0",
            port: 5314,
          },
        },
      },
      payload: {
        linkId: "link_missing",
        secret: "secret-token",
        agentName: "local-agent",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.success, false);
    assert.match(result.data.error, /Contact link not found/);
    assert.match(result.data.error, /wrong endpoint or port/);
    assert.match(result.data.error, /Contact link expired/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
