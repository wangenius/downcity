/**
 * Agent 专用 Token 服务。
 *
 * 关键点（中文）
 * - 为每个 Agent 项目签发独立的 service token，用于 shell 内调用 city 命令。
 * - Token 关联到统一账户系统，但使用特殊的 "agent-service" 用户。
 * - 支持追溯、吊销、权限控制。
 */

import { nanoid } from "nanoid";
import { AuthStore } from "./AuthStore.js";
import { generateAccessToken, hashAccessToken } from "./TokenService.js";
import type { AuthIssuedToken } from "@/types/auth/AuthToken.js";

const AGENT_SERVICE_USERNAME = "agent-service";
const AGENT_SERVICE_DISPLAY_NAME = "Agent Service Account";

/**
 * Agent Token 信息。
 */
export interface AgentTokenInfo {
  token: string;
  tokenId: string;
  projectRoot: string;
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
 * 为指定 Agent 项目签发或复用 token。
 *
 * 策略（中文）
 * 1. 检查是否已有该项目的有效 token（未吊销、未过期）
 * 2. 有则复用，无则创建新 token
 * 3. token 名称包含项目路径摘要，便于识别
 */
export function ensureAgentToken(projectRoot: string): AgentTokenInfo {
  const store = new AuthStore();
  try {
    const { userId } = ensureAgentServiceUser(store);
    const tokenName = buildAgentTokenName(projectRoot);

    // 查找该项目现有的有效 token
    const existingTokens = store.listTokensByUserId(userId);
    const now = new Date().toISOString();

    for (const record of existingTokens) {
      if (record.name !== tokenName) continue;
      if (record.revokedAt) continue;
      if (record.expiresAt && record.expiresAt <= now) continue;

      // 找到有效 token，但无法获取明文（已丢失），需要吊销并重建
      // 注意：这里只能吊销，无法复用，因为明文 token 只在签发时存在
      store.revokeToken(record.id);
      break;
    }

    // 创建新 token
    const plainToken = generateAccessToken();
    const record = store.createToken({
      userId,
      name: tokenName,
      tokenHash: hashAccessToken(plainToken),
      // Agent token 默认 1 年有效期
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return {
      token: plainToken,
      tokenId: record.id,
      projectRoot,
    };
  } finally {
    store.close();
  }
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
