/**
 * 统一账户服务层。
 *
 * 关键点（中文）
 * - 该模块承接 bootstrap、login、token 校验等业务语义。
 * - 路由层只调用这里，不直接碰数据库与密码哈希细节。
 */

import {
  AUTH_DEFAULT_ROLES,
  type AuthDefaultRoleName,
} from "@/types/auth/AuthPermission.js";
import type {
  AuthAdminIssuedUserTokenPayload,
  AuthAdminRoleCatalogItem,
  AuthAdminUserSummary,
  AuthAdminUserTokensPayload,
  AuthAdminUsersPayload,
} from "@/types/auth/AuthAdmin.js";
import type { AuthIssuedToken, AuthTokenSummary } from "@/types/auth/AuthToken.js";
import type { AuthPrincipal, AuthUser } from "@/types/auth/AuthTypes.js";
import { optionalTrimmedText } from "@/utils/store/StoreShared.js";
import { AuthError } from "./AuthError.js";
import { AuthStore, type AuthStoreOptions } from "./AuthStore.js";
import { hashPassword, verifyPassword } from "./PasswordHasher.js";
import { extractBearerToken, generateAccessToken, hashAccessToken } from "./TokenService.js";

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
   * 判断当前是否已存在统一账户用户。
   */
  hasUsers(): boolean {
    return this.store.countUsers() > 0;
  }

  /**
   * 初始化首个管理员。
   */
  bootstrapAdmin(input: {
    username: string;
    password: string;
    displayName?: string;
    tokenName?: string;
  }): { user: AuthCurrentUserPayload; token: AuthIssuedToken } {
    if (this.store.countUsers() > 0) {
      throw new AuthError("Admin bootstrap is already completed", 409);
    }
    const username = this.requireUsername(input.username);
    const password = this.requirePassword(input.password);
    this.store.ensureDefaultCatalog();
    const user = this.store.createUser({
      username,
      passwordHash: hashPassword(password),
      displayName: input.displayName,
      status: "active",
    });
    this.store.assignRoleToUser({
      userId: user.id,
      roleName: "admin",
    });
    const issued = this.issueTokenForUser({
      user,
      tokenName: input.tokenName || "bootstrap-admin",
    });
    this.store.insertAuditLog({
      actorUserId: user.id,
      actorTokenId: issued.record.id,
      resourceType: "auth_user",
      resourceId: user.id,
      action: "bootstrap_admin",
      result: "success",
      metaJson: JSON.stringify({ username }),
    });
    return {
      user: this.toUserPayload(user),
      token: issued.token,
    };
  }

  /**
   * 用户登录并签发新 token。
   */
  login(input: {
    username: string;
    password: string;
    tokenName?: string;
  }): { user: AuthCurrentUserPayload; token: AuthIssuedToken } {
    const username = this.requireUsername(input.username);
    const password = this.requirePassword(input.password);
    const user = this.store.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      this.store.insertAuditLog({
        resourceType: "auth_user",
        action: "login",
        result: "invalid_credentials",
        metaJson: JSON.stringify({ username }),
      });
      throw new AuthError("Invalid username or password", 401);
    }
    this.ensureUserActive(user);
    const issued = this.issueTokenForUser({
      user,
      tokenName: input.tokenName || "login",
    });
    this.store.insertAuditLog({
      actorUserId: user.id,
      actorTokenId: issued.record.id,
      resourceType: "auth_user",
      resourceId: user.id,
      action: "login",
      result: "success",
      metaJson: JSON.stringify({ username }),
    });
    return {
      user: this.toUserPayload(user),
      token: issued.token,
    };
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
   * 为当前用户创建新的 token。
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
      .map((item) => this.store.toTokenSummary(item));
  }

  /**
   * 吊销当前用户的 token。
   */
  revokeToken(principal: AuthPrincipal, tokenIdInput: string): AuthTokenSummary {
    const tokenId = String(tokenIdInput || "").trim();
    if (!tokenId) throw new AuthError("tokenId is required", 400);
    const record = this.store.getTokenById(tokenId);
    if (!record || record.userId !== principal.userId) {
      throw new AuthError("Token not found", 404);
    }
    const revoked = this.store.revokeToken(record.id);
    if (!revoked) throw new AuthError("Token not found", 404);
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_token",
      resourceId: revoked.id,
      action: "token_revoke",
      result: "success",
      metaJson: JSON.stringify({ name: revoked.name }),
    });
    return this.store.toTokenSummary(revoked);
  }

  /**
   * 读取统一账户管理页所需的用户与角色目录。
   */
  listAdminUsers(): AuthAdminUsersPayload {
    return {
      roles: this.listRoleCatalog(),
      users: this.store.listUsers().map((user) => this.toAdminUserSummary(user)),
    };
  }

  /**
   * 创建新的统一账户用户。
   */
  createAdminUser(principal: AuthPrincipal, input: {
    username: string;
    password: string;
    displayName?: string;
    roleNames?: string[];
  }): AuthAdminUserSummary {
    const username = this.requireUsername(input.username);
    const password = this.requirePassword(input.password);
    if (this.store.findUserByUsername(username)) {
      throw new AuthError("Username already exists", 409);
    }
    this.store.ensureDefaultCatalog();
    const roleNames = this.normalizeRoleNames(input.roleNames);
    const user = this.store.createUser({
      username,
      passwordHash: hashPassword(password),
      displayName: input.displayName,
      status: "active",
    });
    this.store.replaceRolesByUserId({
      userId: user.id,
      roleNames,
    });
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_user",
      resourceId: user.id,
      action: "admin_user_create",
      result: "success",
      metaJson: JSON.stringify({
        username,
        roleNames,
      }),
    });
    return this.requireAdminUser(user.id);
  }

  /**
   * 更新用户展示信息或启停状态。
   */
  updateAdminUser(principal: AuthPrincipal, input: {
    userId: string;
    displayName?: string;
    status?: "active" | "disabled";
  }): AuthAdminUserSummary {
    const userId = this.requireUserId(input.userId);
    const current = this.requireUser(userId);
    const nextStatus = input.status === "disabled" ? "disabled" : "active";
    this.ensureAdminCoverage({
      currentUser: current,
      nextStatus,
      nextRoleNames: this.store.listRoleNamesByUserId(userId),
    });
    const updated = this.store.updateUser({
      userId,
      displayName: input.displayName,
      status: nextStatus,
    });
    if (!updated) throw new AuthError("User not found", 404);
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_user",
      resourceId: userId,
      action: "admin_user_update",
      result: "success",
      metaJson: JSON.stringify({
        status: nextStatus,
        displayName: optionalTrimmedText(input.displayName),
      }),
    });
    return this.requireAdminUser(userId);
  }

  /**
   * 覆盖用户角色集合。
   */
  setAdminUserRoles(principal: AuthPrincipal, input: {
    userId: string;
    roleNames?: string[];
  }): AuthAdminUserSummary {
    const userId = this.requireUserId(input.userId);
    const current = this.requireUser(userId);
    const roleNames = this.normalizeRoleNames(input.roleNames);
    this.ensureAdminCoverage({
      currentUser: current,
      nextStatus: current.status,
      nextRoleNames: roleNames,
    });
    this.store.replaceRolesByUserId({
      userId,
      roleNames,
    });
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_user",
      resourceId: userId,
      action: "admin_user_set_roles",
      result: "success",
      metaJson: JSON.stringify({ roleNames }),
    });
    return this.requireAdminUser(userId);
  }

  /**
   * 读取目标用户 token 列表。
   */
  listAdminUserTokens(userIdInput: string): AuthAdminUserTokensPayload {
    const user = this.requireAdminUser(userIdInput);
    return {
      user,
      tokens: this.store
        .listTokensByUserId(user.id)
        .map((item) => this.store.toTokenSummary(item)),
    };
  }

  /**
   * 代目标用户签发新 token。
   */
  createAdminUserToken(principal: AuthPrincipal, input: {
    userId: string;
    name: string;
    expiresAt?: string;
  }): AuthAdminIssuedUserTokenPayload {
    const user = this.requireUser(input.userId);
    this.ensureUserActive(user);
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
      action: "admin_token_create",
      result: "success",
      metaJson: JSON.stringify({
        userId: user.id,
        name: issued.record.name,
      }),
    });
    return {
      user: this.toAdminUserSummary(user),
      token: issued.token,
    };
  }

  /**
   * 代目标用户吊销 token。
   */
  revokeAdminUserToken(principal: AuthPrincipal, input: {
    userId: string;
    tokenId: string;
  }): AuthTokenSummary {
    const userId = this.requireUserId(input.userId);
    const tokenId = String(input.tokenId || "").trim();
    if (!tokenId) throw new AuthError("tokenId is required", 400);
    this.requireUser(userId);
    const record = this.store.getTokenById(tokenId);
    if (!record || record.userId !== userId) {
      throw new AuthError("Token not found", 404);
    }
    const revoked = this.store.revokeToken(record.id);
    if (!revoked) throw new AuthError("Token not found", 404);
    this.store.insertAuditLog({
      actorUserId: principal.userId,
      actorTokenId: principal.tokenId,
      resourceType: "auth_token",
      resourceId: revoked.id,
      action: "admin_token_revoke",
      result: "success",
      metaJson: JSON.stringify({
        userId,
        name: revoked.name,
      }),
    });
    return this.store.toTokenSummary(revoked);
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

  private requireUsername(value: string): string {
    const username = String(value || "").trim();
    if (!username) throw new AuthError("username is required", 400);
    return username;
  }

  private requirePassword(value: string): string {
    const password = String(value || "");
    if (!password.trim()) throw new AuthError("password is required", 400);
    return password;
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

  private requireAdminUser(userIdInput: string): AuthAdminUserSummary {
    const user = this.requireUser(userIdInput);
    return this.toAdminUserSummary(user);
  }

  private listRoleCatalog(): AuthAdminRoleCatalogItem[] {
    return AUTH_DEFAULT_ROLES.map((role) => ({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    }));
  }

  private normalizeRoleNames(values?: string[]): string[] {
    const requested = Array.isArray(values)
      ? [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    const allowed = new Set<AuthDefaultRoleName>(
      AUTH_DEFAULT_ROLES.map((item) => item.name),
    );
    const roleNames = requested.filter(
      (item): item is AuthDefaultRoleName => allowed.has(item as AuthDefaultRoleName),
    );
    if (roleNames.length < 1) {
      throw new AuthError("At least one valid role is required", 400);
    }
    return roleNames;
  }

  private ensureAdminCoverage(params: {
    currentUser: AuthUser;
    nextStatus: "active" | "disabled";
    nextRoleNames: string[];
  }): void {
    const currentRoleNames = this.store.listRoleNamesByUserId(params.currentUser.id);
    const currentlyActiveAdmin =
      params.currentUser.status === "active" &&
      currentRoleNames.includes("admin");
    const nextActiveAdmin =
      params.nextStatus === "active" &&
      params.nextRoleNames.includes("admin");
    if (!currentlyActiveAdmin || nextActiveAdmin) return;
    if (this.store.countActiveUsersByRole("admin") <= 1) {
      throw new AuthError("At least one active admin must remain", 409);
    }
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

  private toAdminUserSummary(user: AuthUser): AuthAdminUserSummary {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      roles: this.store.listRoleNamesByUserId(user.id),
      permissions: this.store.listPermissionKeysByUserId(user.id),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
