/**
 * chat authorization 策略测试（node:test）。
 *
 * 关键点（中文）
 * - DM / 群聊权限统一只基于 user role。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateIncomingChatAuthorization,
  resolveAuthorizedUserRole,
} from "../../bin/services/chat/runtime/AuthorizationPolicy.js";

test("resolveAuthorizedUserRole returns the bound permission group and falls back to default", () => {
  const config = {
    name: "demo",
    version: "1.0.0",
  };
  const authorizationConfig = {
    roles: {
      default: { roleId: "default", name: "Default", permissions: [] },
      admin: { roleId: "admin", name: "Admin", permissions: ["agent.manage"] },
    },
    channels: {
      feishu: {
        defaultUserRoleId: "default",
        userRoles: {
          ou_admin: "admin",
        },
      },
    },
  };

  assert.equal(
    resolveAuthorizedUserRole({
      channel: "feishu",
      userId: "ou_admin",
      authorizationConfig,
    })?.roleId,
    "admin",
  );
  assert.equal(
    resolveAuthorizedUserRole({
      channel: "feishu",
      userId: "ou_guest",
      authorizationConfig,
    })?.roleId,
    "default",
  );
  assert.equal(
    resolveAuthorizedUserRole({
      channel: "feishu",
    }),
    undefined,
  );
});

test("evaluateIncomingChatAuthorization uses only user role permissions", () => {
  const config = {
    name: "demo",
    version: "1.0.0",
  };
  const authorizationConfig = {
    roles: {
      default: { roleId: "default", name: "Default", permissions: [] },
      member: { roleId: "member", name: "Member", permissions: ["chat.dm.use"] },
      group_member: {
        roleId: "group_member",
        name: "Group Member",
        permissions: ["chat.dm.use", "chat.group.use"],
      },
    },
    channels: {
      feishu: {
        defaultUserRoleId: "default",
        userRoles: {
          ou_allowed: "member",
          ou_group_member: "group_member",
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
      decision: "block",
      isOwner: false,
      userRoleId: "default",
      reason: "dm_role_blocked",
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
      userRoleId: "member",
      reason: "dm_role_allowed",
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
      userRoleId: "default",
      reason: "user_group_permission_blocked",
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
      userRoleId: "group_member",
      reason: "group_user_role_allowed",
    },
  );
});
