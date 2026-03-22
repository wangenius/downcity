/**
 * Auth Plugin 统一 API。
 *
 * 关键点（中文）
 * - 为 Console / TUI / 其他模块提供统一的 auth 读写入口。
 * - 调用方不直接依赖 capability / action 字符串，也不自己拼装响应结构。
 * - 这里返回的是业务语义对象，而不是 plugin 底层传输细节。
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type {
  AuthSetUserRolePayload,
  ChatAuthorizationCatalog,
  ChatAuthorizationConfig,
  ChatAuthorizationSnapshot,
} from "@/types/AuthPlugin.js";
import { CHAT_AUTHORIZATION_CATALOG } from "@/types/AuthPlugin.js";
import {
  readAuthorizationConfigViaPlugin,
  readAuthorizationSnapshotViaPlugin,
  setAuthorizationUserRoleViaPlugin,
  writeAuthorizationConfigViaPlugin,
} from "@/plugins/auth/Runtime.js";

/**
 * authorization 页面快照。
 */
export interface AuthDashboardPayload {
  /**
   * 后端提供的 auth 目录。
   */
  catalog: ChatAuthorizationCatalog;

  /**
   * 当前静态授权配置。
   */
  config: ChatAuthorizationConfig;

  /**
   * 已观测用户列表。
   */
  users: ChatAuthorizationSnapshot["users"];

  /**
   * 已观测会话列表。
   */
  chats: ChatAuthorizationSnapshot["chats"];
}

/**
 * 读取 authorization 页面所需的完整数据。
 */
export async function readAuthDashboardPayload(
  runtime: ServiceRuntime,
): Promise<AuthDashboardPayload> {
  const [config, snapshot] = await Promise.all([
    readAuthorizationConfigViaPlugin(runtime),
    readAuthorizationSnapshotViaPlugin(runtime),
  ]);
  return {
    catalog: CHAT_AUTHORIZATION_CATALOG,
    config,
    users: snapshot.users,
    chats: snapshot.chats,
  };
}

/**
 * 覆盖写入授权配置，并返回最新 dashboard payload。
 */
export async function writeAuthDashboardConfig(params: {
  runtime: ServiceRuntime;
  config: ChatAuthorizationConfig;
}): Promise<AuthDashboardPayload> {
  await writeAuthorizationConfigViaPlugin({
    runtime: params.runtime,
    config: params.config,
  });
  return readAuthDashboardPayload(params.runtime);
}

/**
 * 设置用户角色，并返回最新 dashboard payload。
 */
export async function setAuthDashboardUserRole(params: {
  runtime: ServiceRuntime;
  input: AuthSetUserRolePayload;
}): Promise<AuthDashboardPayload> {
  await setAuthorizationUserRoleViaPlugin({
    runtime: params.runtime,
    channel: params.input.channel,
    userId: params.input.userId,
    roleId: params.input.roleId,
  });
  return readAuthDashboardPayload(params.runtime);
}
