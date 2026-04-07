/**
 * 统一账户服务层。
 *
 * 关键点（中文）
 * - 该模块承接本机 token 初始化、token 校验与 token 管理等业务语义。
 * - 路由层只调用这里，不直接碰数据库与密码哈希细节。
 */

import type { AuthIssuedToken, AuthTokenSummary } from "@/shared/types/auth/AuthToken.js";
import type { AuthPrincipal, AuthTokenRecord, AuthUser } from "@/shared/types/auth/AuthTypes.js";
import { optionalTrimmedText } from "@/shared/utils/store/StoreShared.js";
import { AuthError } from "./AuthError.js";
import { AuthStore, type AuthStoreOptions } from "./AuthStore.js";
import { extractBearerToken, generateAccessToken, hashAccessToken } from "./TokenService.js";

const LOCAL_CLI_USERNAME = "local-cli";
const LOCAL_CLI_DISPLAY_NAME = "Local CLI";
const LOCAL_CLI_PASSWORD_HASH = "[token-only-local-cli]";

/**
 * AuthService 构造参数。
 */
export interface AuthServiceOptions extends AuthStoreOptions {
  /**
   * 复用外部传入的 store。
   */
  store?: AuthStore;
}

/**
 * 登录/初始化后返回的用户摘要。
 */
export interface AuthCurrentUserPayload {
  /**
   * 用户 ID。
   */
  id: string;
  /**
   * 用户名。
   */
  username: string;
  /**
   * 展示名。
   */
  displayName?: string;
  /**
   * 角色列表。
   */
  roles: string[];
  /**
   * 权限列表。
   */
  permissions: string[];
}

/**
 * AuthService 门面。
 */
export class AuthService {
  private readonly store: AuthStore;
  private readonly ownsStore: boolean;

  constructor(options: AuthServiceOptions = {}) {
    if (options.store) {
      this.store = options.store;
      this.ownsStore = false;
      return;
    }
    this.store = new AuthStore(options);
    this.ownsStore = true;
  }

  /**
   * 关闭底层连接。
   */
  close(): void {
    if (this.ownsStore) this.store.close();
  }

  /**
   * 判断当前是否已经存在可用的本机 CLI access token。
   */
  hasLocalCliAccess(): boolean {
    const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
    if (!user) return false;
    return this.store
      .listTokensByUserId(user.id)
      .some((item) => this.isTokenActive(item));
  }

  /**
   * 确保存在本机 CLI 主体，并为其签发新的 access token。
   */
  ensureLocalCliAccess(input: {
    tokenName: string;
    expiresAt?: string;
  }): { user: AuthCurrentUserPayload; token: AuthIssuedToken } {
    const token = this.createLocalCliToken({
      name: input.tokenName,
      expiresAt: input.expiresAt,
    });
    const user = this.requireLocalCliUser();
    return {
      user: this.toUserPayload(user),
      token,
    };
  }

  /**
   * 读取本机 CLI 主体的 token 列表。
   */
  listLocalCliTokens(): AuthTokenSummary[] {
    const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
    if (!user) return [];
    return this.store
      .listTokensByUserId(user.id)
      .filter((item) => !item.revokedAt)
      .map((item) => this.store.toTokenSummary(item));
  }

  /**
   * 为本机 CLI 主体签发新的 access token。
   */
  createLocalCliToken(input: {
    name: string;
    expiresAt?: string;
  }): AuthIssuedToken {
    const user = this.ensureLocalCliUser();
    const issued = this.issueTokenForUser({
      user,
      tokenName: input.name,
      expiresAt: input.expiresAt,
    });
    this.store.insertAuditLog({
      actorUserId: user.id,
      resourceType: "auth_token",
      resourceId: issued.record.id,
      action: "token_create",
      result: "success",
      metaJson: JSON.stringify({
        name: issued.record.name,
        source: "local-cli",
      }),
    });
    return issued.token;
  }

  /**
   * 删除本机 CLI 主体下的 token。
   */
  deleteLocalCliToken(tokenIdInput: string): void {
    const user = this.requireLocalCliUser();
    const record = this.requireLocalCliTokenRecord(tokenIdInput, user.id);
    const deleted = this.store.deleteToken(record.id);
    if (!deleted) throw new AuthError("Token not found", 404);
    this.store.insertAuditLog({
      actorUserId: user.id,
      resourceType: "auth_token",
      resourceId: record.id,
      action: "token_delete",
      result: "success",
      metaJson: JSON.stringify({
        name: record.name,
        source: "local-cli",
      }),
    });
  }

  /**
   * 解析 Authorization 头并返回 principal。
   */
  authenticateBearerHeader(headerValue: string | undefined): AuthPrincipal {
    const plainToken = extractBearerToken(headerValue);
    if (!plainToken) throw new AuthError("Missing bearer token", 401);
    const record = this.store.findTokenByHash(hashAccessToken(plainToken));
    if (!record) throw new AuthError("Invalid bearer token", 401);
    if (record.revokedAt) throw new AuthError("Token is revoked", 401);
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new AuthError("Token is expired", 401);
    }
    const user = this.store.getUserById(record.userId);
    if (!user) throw new AuthError("User not found for token", 401);
    this.ensureUserActive(user);
    this.store.touchToken(record.id);
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      tokenId: record.id,
      tokenName: record.name,
      roles: this.store.listRoleNamesByUserId(user.id),
      permissions: this.store.listPermissionKeysByUserId(user.id),
    };
  }

  /**
   * 返回当前用户信息。
   */
  getCurrentUser(principal: AuthPrincipal): AuthCurrentUserPayload {
    return {
      id: principal.userId,
      username: principal.username,
      displayName: principal.displayName,
      roles: [...principal.roles],
      permissions: [...principal.permissions],
    };
  }

  /**
   * 为当前 Bearer 调用主体创建新的 token。
   */
  createToken(principal: AuthPrincipal, input: {
    name: string;
    expiresAt?: string;
  }): AuthIssuedToken {
    const user = this.store.getUserById(principal.userId);
    if (!user) throw new AuthError("User not found", 404);
    const issued = this.issueTokenForUser({
      user,
      tokenName: input.name,
      expiresAt: input.expiresAt,
    });
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_token",
      resourceId: issued.record.id,
      action: "token_create",
      result: "success",
      metaJson: JSON.stringify({ name: issued.record.name }),
    });
    return issued.token;
  }

  /**
   * 读取当前用户 token 列表。
   */
  listTokens(principal: AuthPrincipal): AuthTokenSummary[] {
    return this.store
      .listTokensByUserId(principal.userId)
      .filter((item) => !item.revokedAt)
      .map((item) => this.store.toTokenSummary(item));
  }

  /**
   * 删除当前用户的 token。
   */
  deleteToken(principal: AuthPrincipal, tokenIdInput: string): void {
    const tokenId = String(tokenIdInput || "").trim();
    if (!tokenId) throw new AuthError("tokenId is required", 400);
    const record = this.store.getTokenById(tokenId);
    if (!record || record.userId !== principal.userId) {
      throw new AuthError("Token not found", 404);
    }
    const deleted = this.store.deleteToken(record.id);
    if (!deleted) throw new AuthError("Token not found", 404);
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_token",
      resourceId: tokenId,
      action: "token_delete",
      result: "success",
      metaJson: JSON.stringify({ name: record.name }),
    });
  }

  private issueTokenForUser(params: {
    user: AuthUser;
    tokenName: string;
    expiresAt?: string;
  }): { record: ReturnType<AuthStore["createToken"]>; token: AuthIssuedToken } {
    const plainToken = generateAccessToken();
    const record = this.store.createToken({
      userId: params.user.id,
      name: this.requireTokenName(params.tokenName),
      tokenHash: hashAccessToken(plainToken),
      expiresAt: optionalTrimmedText(params.expiresAt),
    });
    return {
      record,
      token: this.store.toIssuedToken(record, plainToken),
    };
  }

  private ensureUserActive(user: AuthUser): void {
    if (user.status !== "active") {
      throw new AuthError("User is disabled", 403);
    }
  }

  private isTokenActive(record: Pick<AuthTokenRecord, "revokedAt" | "expiresAt">): boolean {
    if (record.revokedAt) return false;
    if (!record.expiresAt) return true;
    return new Date(record.expiresAt).getTime() > Date.now();
  }

  private ensureLocalCliUser(): AuthUser {
    this.store.ensureDefaultCatalog();
    const existing = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
    if (existing) {
      this.ensureUserActive(existing);
      return existing;
    }
    const user = this.store.createUser({
      username: LOCAL_CLI_USERNAME,
      passwordHash: LOCAL_CLI_PASSWORD_HASH,
      displayName: LOCAL_CLI_DISPLAY_NAME,
      status: "active",
    });
    this.store.assignRoleToUser({
      userId: user.id,
      roleName: "admin",
    });
    return user;
  }

  private requireTokenName(value: string): string {
    const tokenName = String(value || "").trim();
    if (!tokenName) throw new AuthError("token name is required", 400);
    return tokenName;
  }

  private requireUserId(value: string): string {
    const userId = String(value || "").trim();
    if (!userId) throw new AuthError("userId is required", 400);
    return userId;
  }

  private requireUser(userIdInput: string): AuthUser {
    const userId = this.requireUserId(userIdInput);
    const user = this.store.getUserById(userId);
    if (!user) throw new AuthError("User not found", 404);
    return user;
  }

  private requireLocalCliUser(): AuthUser {
    const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
    if (!user) throw new AuthError("Local CLI access is not initialized", 404);
    this.ensureUserActive(user);
    return user;
  }

  private requireLocalCliTokenRecord(
    tokenIdInput: string,
    expectedUserId: string,
  ): AuthTokenRecord {
    const tokenId = String(tokenIdInput || "").trim();
    if (!tokenId) throw new AuthError("tokenId is required", 400);
    const record = this.store.getTokenById(tokenId);
    if (!record || record.userId !== expectedUserId) {
      throw new AuthError("Token not found", 404);
    }
    return record;
  }

  private toUserPayload(user: AuthUser): AuthCurrentUserPayload {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roles: this.store.listRoleNamesByUserId(user.id),
      permissions: this.store.listPermissionKeysByUserId(user.id),
    };
  }
}
