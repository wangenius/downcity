/**
 * Chat Access 公开行为测试。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatAccessService } from "../bin/index.js";

function create_project_root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "downcity-chat-access-"));
}

function remove_project_root(project_root) {
  fs.rmSync(project_root, { recursive: true, force: true });
}

function telegram_identity(issuer, chat_type = "private") {
  return {
    channel: "telegram",
    issuer,
    subject_id: "8444574557",
    display_name: "Access Tester",
    chat_id: chat_type === "private" ? "8444574557" : "-100001",
    chat_type,
  };
}

test("Chat Access 按 issuer 隔离并复用 pending request", () => {
  const project_root = create_project_root();
  try {
    const service = new ChatAccessService({ project_root });
    const first = service.evaluate(telegram_identity("telegram-main"));
    const repeated = service.evaluate(telegram_identity("telegram-main"));
    const other_issuer = service.evaluate(telegram_identity("telegram-backup"));

    assert.equal(first.reason, "request_pending");
    assert.equal(repeated.request_id, first.request_id);
    assert.notEqual(other_issuer.principal_id, first.principal_id);
    assert.notEqual(other_issuer.request_id, first.request_id);
    assert.equal(service.list_requests("pending").length, 2);
  } finally {
    remove_project_root(project_root);
  }
});

test("approve all、revoke 和 deny 保持明确状态语义", () => {
  const project_root = create_project_root();
  try {
    const service = new ChatAccessService({ project_root });
    const pending = service.evaluate(telegram_identity("telegram-main"));
    assert.ok(pending.request_id);

    const grants = service.approve_request({
      request_id: pending.request_id,
      scope: "all",
      operator: "test",
    });
    assert.deepEqual(grants.map((grant) => grant.scope).sort(), ["direct", "group"]);
    assert.equal(service.evaluate(telegram_identity("telegram-main")).allowed, true);
    assert.equal(service.evaluate(telegram_identity("telegram-main", "supergroup")).allowed, true);

    assert.equal(service.revoke_grant({
      principal_id: pending.principal_id,
      scope: "direct",
      operator: "test",
    }), 1);
    const requested_again = service.evaluate(telegram_identity("telegram-main"));
    assert.equal(requested_again.reason, "request_pending");
    assert.ok(requested_again.request_id);

    service.deny_request({
      request_id: requested_again.request_id,
      operator: "test",
    });
    const denied = service.evaluate(telegram_identity("telegram-main"));
    assert.equal(denied.reason, "grant_denied");
    assert.equal(denied.request_id, undefined);
    assert.equal(service.list_requests("pending").length, 0);
    assert.throws(() => service.revoke_grant({
      principal_id: "principal_missing",
      scope: "all",
      operator: "test",
    }), /principal not found/);
  } finally {
    remove_project_root(project_root);
  }
});

test("旧 Authorization JSON 一次性迁移到 access.db", () => {
  const project_root = create_project_root();
  try {
    const legacy_dir = path.join(project_root, ".downcity", "chat", "authorization");
    fs.mkdirSync(legacy_dir, { recursive: true });
    fs.writeFileSync(path.join(legacy_dir, "config.json"), JSON.stringify({
      roles: {
        member: { permissions: ["chat.dm.use", "chat.group.use"] },
      },
      channels: {
        telegram: { userRoles: { "8444574557": "member" } },
      },
    }));
    fs.writeFileSync(path.join(legacy_dir, "state.json"), JSON.stringify({
      usersByKey: {
        "telegram:8444574557": {
          channel: "telegram",
          userId: "8444574557",
          username: "Legacy User",
          lastChatId: "8444574557",
          lastChatType: "private",
        },
      },
    }));

    const service = new ChatAccessService({
      project_root,
      issuer_by_channel: { telegram: "telegram-main" },
    });
    const principals = service.list_principals();
    assert.equal(principals.length, 1);
    assert.equal(principals[0].principal.issuer, "telegram-main");
    assert.deepEqual(
      principals[0].grants.map((grant) => `${grant.scope}:${grant.effect}`).sort(),
      ["direct:allow", "group:allow"],
    );
    assert.equal(fs.existsSync(path.join(project_root, ".downcity", "chat", "access.db")), true);
    assert.equal(fs.existsSync(path.join(legacy_dir, "config.json")), false);
    assert.equal(fs.existsSync(path.join(
      project_root,
      ".downcity",
      "chat",
      "migration-backup",
      "authorization",
      "config.json",
    )), true);
  } finally {
    remove_project_root(project_root);
  }
});

test("已有 Access 数据时不合并旧 Authorization JSON", () => {
  const project_root = create_project_root();
  try {
    const service = new ChatAccessService({ project_root });
    service.evaluate(telegram_identity("telegram-main"));

    const legacy_dir = path.join(project_root, ".downcity", "chat", "authorization");
    fs.mkdirSync(legacy_dir, { recursive: true });
    fs.writeFileSync(path.join(legacy_dir, "config.json"), JSON.stringify({
      roles: { member: { permissions: ["chat.dm.use"] } },
      channels: { telegram: { userRoles: { legacy_user: "member" } } },
    }));

    const migration_service = new ChatAccessService({
      project_root,
      issuer_by_channel: { telegram: "telegram-main" },
    });
    assert.equal(migration_service.list_principals().length, 1);
    assert.equal(fs.existsSync(path.join(legacy_dir, "config.json")), true);
  } finally {
    remove_project_root(project_root);
  }
});
