/**
 * Agent 专用 Token 服务。
 *
 * 关键点（中文）
 * - 为每个 Agent 项目签发独立的 service token，用于 shell 内调用 city 命令。
 * - Token 关联到统一账户系统，但使用特殊的 "agent-service" 用户。
 * - 支持追溯、吊销、权限控制、自动轮换。
 */

import { nanoid } from "nanoid";
import { AuthStore } from "./AuthStore.js";
import { generateAccessToken, hashAccessToken } from "./TokenService.js";
import type { AuthIssuedToken } from "@/shared/types/auth/AuthToken.js";

const AGENT_SERVICE_USERNAME = "agent-service";
const AGENT_SERVICE_DISPLAY_NAME = "Agent Service Account";

/**
 * Token 有效期配置（毫秒）
 */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 自动轮换阈值（毫秒）
 * 当 token 剩余有效期小于此值时，自动创建新 token
 */
const ROTATION_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 天

/**
 * Agent Token 信息。
 */
export interface AgentTokenInfo {
  token: string;
  tokenId: string;
  projectRoot: string;
  expiresAt: string;
  rotated?: boolean; // 标记是否刚完成轮换
}

/**
 * 确保 agent-service 用户存在。
 */
function ensureAgentServiceUser(store: AuthStore): { userId: string; isNew: boolean } {
  const existing = store.findUserByUsername(AGENT_SERVICE_USERNAME);
  if (existing) {
    return { userId: existing.id, isNew: false };
  }

  // 创建 service 账户（无密码，不能登录）
  const user = store.createUser({
    username: AGENT_SERVICE_USERNAME,
    passwordHash: "[service-account-no-password]",
    displayName: AGENT_SERVICE_DISPLAY_NAME,
    status: "active",
  });

  // 分配 admin 角色（或创建专门的 agent-service 角色）
  store.assignRoleToUser({
    userId: user.id,
    roleName: "admin",
  });

  return { userId: user.id, isNew: true };
}

/**
 * 计算 token 是否应该轮换。
 */
function shouldRotateToken(record: {
  expiresAt?: string;
  revokedAt?: string;
}): boolean {
  if (record.revokedAt) return true;
  if (!record.expiresAt) return true;

  const expiresAt = new Date(record.expiresAt).getTime();
  const now = Date.now();
  const remainingMs = expiresAt - now;

  // 已过期或即将过期（少于阈值）
  return remainingMs < ROTATION_THRESHOLD_MS;
}

/**
 * 为指定 Agent 项目签发或轮换 token。
 *
 * 策略（中文）
 * 1. 检查是否已有该项目的有效 token（未吊销、未过期、且不在轮换窗口期）
 * 2. 如果 token 已过期或即将过期（< 1天），自动轮换（吊销旧 + 创建新）
 * 3. 如果没有有效 token，创建新 token
 */
export function ensureAgentToken(projectRoot: string): AgentTokenInfo {
  const store = new AuthStore();
  try {
    const { userId } = ensureAgentServiceUser(store);
    const tokenName = buildAgentTokenName(projectRoot);

    // 查找该项目现有的有效 token
    const existingTokens = store.listTokensByUserId(userId);

    for (const record of existingTokens) {
      if (record.name !== tokenName) continue;

      // 检查是否需要轮换
      // 关键点（中文）
      // - store 内只保存 token hash，无法恢复历史明文。
      // - 启动链路必须把明文 token 注入进程环境，否则 agent 内部再调 `city ...`
      //   会因为拿不到 Bearer Token 而失败。
      // - 因此即使旧 token 仍然有效，只要这次需要“拿到明文”，也必须吊销旧 token 并重签。
      store.revokeToken(record.id);
      return createNewAgentToken(store, userId, projectRoot, tokenName);
    }

    // 创建新 token
    return createNewAgentToken(store, userId, projectRoot, tokenName);
  } finally {
    store.close();
  }
}

/**
 * 运行时检查并轮换 token。
 *
 * 使用场景：Agent 长期运行期间，定期检查 token 是否需要轮换
 * 返回 null 表示无需轮换，返回 AgentTokenInfo 表示已完成轮换
 */
export function rotateAgentTokenIfNeeded(projectRoot: string): AgentTokenInfo | null {
  const store = new AuthStore();
  try {
    const user = store.findUserByUsername(AGENT_SERVICE_USERNAME);
    if (!user) return null;

    const tokenName = buildAgentTokenName(projectRoot);
    const existingTokens = store.listTokensByUserId(user.id);

    for (const record of existingTokens) {
      if (record.name !== tokenName) continue;

      // 检查是否需要轮换
      if (!shouldRotateToken(record)) {
        return null; // 无需轮换
      }

      // 执行轮换
      store.revokeToken(record.id);
      const newToken = createNewAgentToken(store, user.id, projectRoot, tokenName);
      return { ...newToken, rotated: true };
    }

    // 没有找到现有 token，创建新的
    const newToken = createNewAgentToken(store, user.id, projectRoot, tokenName);
    return { ...newToken, rotated: true };
  } finally {
    store.close();
  }
}

/**
 * 创建新的 Agent Token。
 */
function createNewAgentToken(
  store: AuthStore,
  userId: string,
  projectRoot: string,
  tokenName: string,
): AgentTokenInfo {
  const plainToken = generateAccessToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const record = store.createToken({
    userId,
    name: tokenName,
    tokenHash: hashAccessToken(plainToken),
    expiresAt,
  });

  return {
    token: plainToken,
    tokenId: record.id,
    projectRoot,
    expiresAt,
  };
}

/**
 * 吊销指定 Agent 项目的 token。
 */
export function revokeAgentToken(projectRoot: string): boolean {
  const store = new AuthStore();
  try {
    const user = store.findUserByUsername(AGENT_SERVICE_USERNAME);
    if (!user) return false;

    const tokenName = buildAgentTokenName(projectRoot);
    const tokens = store.listTokensByUserId(user.id);

    let revoked = false;
    for (const record of tokens) {
      if (record.name === tokenName && !record.revokedAt) {
        store.revokeToken(record.id);
        revoked = true;
      }
    }

    return revoked;
  } finally {
    store.close();
  }
}

/**
 * 列出所有 Agent token。
 */
export function listAgentTokens(): Array<{
  tokenId: string;
  projectRoot: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  needsRotation?: boolean;
}> {
  const store = new AuthStore();
  try {
    const user = store.findUserByUsername(AGENT_SERVICE_USERNAME);
    if (!user) return [];

    const tokens = store.listTokensByUserId(user.id);
    return tokens
      .filter((t) => t.name.startsWith("agent:"))
      .map((t) => ({
        tokenId: t.id,
        projectRoot: extractProjectRootFromTokenName(t.name),
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        needsRotation: !t.revokedAt && shouldRotateToken(t),
      }));
  } finally {
    store.close();
  }
}

/**
 * 构建 agent token 名称。
 */
function buildAgentTokenName(projectRoot: string): string {
  // 使用项目路径的 hash 作为标识，避免路径过长
  const normalized = projectRoot.replace(/\/+$/, "").replace(/\\/g, "/");
  return `agent:${normalized}`;
}

/**
 * 从 token 名称提取项目路径。
 */
function extractProjectRootFromTokenName(name: string): string {
  if (!name.startsWith("agent:")) return "";
  return name.slice(6); // 去掉 "agent:" 前缀
}
