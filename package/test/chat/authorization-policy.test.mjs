/**
 * chat authorization 策略测试（node:test）。
 *
 * 关键点（中文）
 * - `is_master` 应优先基于新的 ownerIds 判定，而不是旧版单个 authId。
 * - DM / 群聊权限要区分 pairing、allowlist 与 group allowlist。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateIncomingChatAuthorization,
  resolveOwnerMatch,
} from "../../bin/services/chat/runtime/AuthorizationPolicy.js";
import { resolveFeishuMasterStatus } from "../../bin/services/chat/channels/feishu/Auth.js";

test("resolveOwnerMatch prefers configured ownerIds and only returns unknown when userId is missing", () => {
  const config = {
    name: "demo",
    version: "1.0.0",
  };
  const authorizationConfig = {
    channels: {
      feishu: {
        ownerIds: ["ou_owner"],
      },
    },
  };

  assert.equal(
    resolveOwnerMatch({
      config,
      channel: "feishu",
      userId: "ou_owner",
      authorizationConfig,
    }),
    "master",
  );
  assert.equal(
    resolveOwnerMatch({
      config,
      channel: "feishu",
      userId: "ou_guest",
      authorizationConfig,
    }),
    "guest",
  );
  assert.equal(
    resolveOwnerMatch({
      config,
      channel: "feishu",
    }),
    "unknown",
  );
});

test("resolveFeishuMasterStatus still falls back to legacy FEISHU_AUTH_ID when ownerIds are not configured", () => {
  const config = {
    name: "demo",
    version: "1.0.0",
  };

  assert.equal(
    resolveFeishuMasterStatus({
      config,
      env: { FEISHU_AUTH_ID: "ou_legacy_owner" },
      userId: "ou_legacy_owner",
    }),
    "master",
  );
  assert.equal(
    resolveFeishuMasterStatus({
      config,
      env: { FEISHU_AUTH_ID: "ou_legacy_owner" },
      userId: "ou_other",
    }),
    "guest",
  );
});

test("evaluateIncomingChatAuthorization supports DM pairing and group allowlist like openclaw", () => {
  const config = {
    name: "demo",
    version: "1.0.0",
  };
  const authorizationConfig = {
    channels: {
      feishu: {
        ownerIds: ["ou_owner"],
        dmPolicy: "pairing",
        allowFrom: ["ou_allowed"],
        groupPolicy: "allowlist",
        groupAllowFrom: ["oc_group_1"],
        groups: {
          oc_group_1: {
            allowFrom: ["ou_group_member"],
          },
        },
      },
    },
  };

  assert.deepEqual(
    evaluateIncomingChatAuthorization({
      config,
      channel: "feishu",
      authorizationConfig,
      input: {
        channel: "feishu",
        chatId: "oc_dm_1",
        chatType: "p2p",
        userId: "ou_new_user",
      },
    }),
    {
      decision: "pairing",
      isOwner: false,
      reason: "dm_policy_pairing_required",
    },
  );

  assert.deepEqual(
    evaluateIncomingChatAuthorization({
      config,
      channel: "feishu",
      authorizationConfig,
      input: {
        channel: "feishu",
        chatId: "oc_dm_2",
        chatType: "p2p",
        userId: "ou_allowed",
      },
    }),
    {
      decision: "allow",
      isOwner: false,
      reason: "allowlist_allowed",
    },
  );

  assert.deepEqual(
    evaluateIncomingChatAuthorization({
      config,
      channel: "feishu",
      authorizationConfig,
      input: {
        channel: "feishu",
        chatId: "oc_group_1",
        chatType: "group",
        userId: "ou_other",
      },
    }),
    {
      decision: "block",
      isOwner: false,
      reason: "group_user_not_in_allowlist",
    },
  );

  assert.deepEqual(
    evaluateIncomingChatAuthorization({
      config,
      channel: "feishu",
      authorizationConfig,
      input: {
        channel: "feishu",
        chatId: "oc_group_1",
        chatType: "group",
        userId: "ou_group_member",
      },
    }),
    {
      decision: "allow",
      isOwner: false,
      reason: "group_allowlist_and_user_allowlist_allowed",
    },
  );
});
