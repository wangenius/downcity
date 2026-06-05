/**
 * 统一账户服务层。
 *
 * 关键点（中文）
 * - 该模块承接本机 token 初始化、token 校验与 token 管理等业务语义。
 * - 路由层只调用这里，不直接碰数据库与密码哈希细节。
 */
import { AuthError } from "./AuthError.js";
import { AuthStore } from "./AuthStore.js";
import { extractBearerToken, generateAccessToken, hashAccessToken } from "./TokenService.js";
import { optionalTrimmedText } from "../store/StoreShared.js";
const LOCAL_CLI_USERNAME = "local-cli";
const LOCAL_CLI_DISPLAY_NAME = "Local CLI";
const LOCAL_CLI_PASSWORD_HASH = "[token-only-local-cli]";
/**
 * AuthService 门面。
 */
export class AuthService {
    store;
    ownsStore;
    constructor(options = {}) {
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
    close() {
        if (this.ownsStore)
            this.store.close();
    }
    /**
     * 判断当前是否已经存在可用的本机 CLI access token。
     */
    hasLocalCliAccess() {
        const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
        if (!user)
            return false;
        return this.store
            .listTokensByUserId(user.id)
            .some((item) => this.isTokenActive(item));
    }
    /**
     * 确保存在本机 CLI 主体，并为其签发新的 access token。
     */
    ensureLocalCliAccess(input) {
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
    listLocalCliTokens() {
        const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
        if (!user)
            return [];
        return this.store
            .listTokensByUserId(user.id)
            .filter((item) => !item.revokedAt)
            .map((item) => this.store.toTokenSummary(item));
    }
    /**
     * 为本机 CLI 主体签发新的 access token。
     */
    createLocalCliToken(input) {
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
    deleteLocalCliToken(tokenIdInput) {
        const user = this.requireLocalCliUser();
        const record = this.requireLocalCliTokenRecord(tokenIdInput, user.id);
        const deleted = this.store.deleteToken(record.id);
        if (!deleted)
            throw new AuthError("Token not found", 404);
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
    authenticateBearerHeader(headerValue) {
        const plainToken = extractBearerToken(headerValue);
        if (!plainToken)
            throw new AuthError("Missing bearer token", 401);
        const record = this.store.findTokenByHash(hashAccessToken(plainToken));
        if (!record)
            throw new AuthError("Invalid bearer token", 401);
        if (record.revokedAt)
            throw new AuthError("Token is revoked", 401);
        if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
            throw new AuthError("Token is expired", 401);
        }
        const user = this.store.getUserById(record.userId);
        if (!user)
            throw new AuthError("User not found for token", 401);
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
    getCurrentUser(principal) {
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
    createToken(principal, input) {
        const user = this.store.getUserById(principal.userId);
        if (!user)
            throw new AuthError("User not found", 404);
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
    listTokens(principal) {
        return this.store
            .listTokensByUserId(principal.userId)
            .filter((item) => !item.revokedAt)
            .map((item) => this.store.toTokenSummary(item));
    }
    /**
     * 删除当前用户的 token。
     */
    deleteToken(principal, tokenIdInput) {
        const tokenId = String(tokenIdInput || "").trim();
        if (!tokenId)
            throw new AuthError("tokenId is required", 400);
        const record = this.store.getTokenById(tokenId);
        if (!record || record.userId !== principal.userId) {
            throw new AuthError("Token not found", 404);
        }
        const deleted = this.store.deleteToken(record.id);
        if (!deleted)
            throw new AuthError("Token not found", 404);
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
    issueTokenForUser(params) {
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
    ensureUserActive(user) {
        if (user.status !== "active") {
            throw new AuthError("User is disabled", 403);
        }
    }
    isTokenActive(record) {
        if (record.revokedAt)
            return false;
        if (!record.expiresAt)
            return true;
        return new Date(record.expiresAt).getTime() > Date.now();
    }
    ensureLocalCliUser() {
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
    requireTokenName(value) {
        const tokenName = String(value || "").trim();
        if (!tokenName)
            throw new AuthError("token name is required", 400);
        return tokenName;
    }
    requireUserId(value) {
        const userId = String(value || "").trim();
        if (!userId)
            throw new AuthError("userId is required", 400);
        return userId;
    }
    requireUser(userIdInput) {
        const userId = this.requireUserId(userIdInput);
        const user = this.store.getUserById(userId);
        if (!user)
            throw new AuthError("User not found", 404);
        return user;
    }
    requireLocalCliUser() {
        const user = this.store.findUserByUsername(LOCAL_CLI_USERNAME);
        if (!user)
            throw new AuthError("Local CLI access is not initialized", 404);
        this.ensureUserActive(user);
        return user;
    }
    requireLocalCliTokenRecord(tokenIdInput, expectedUserId) {
        const tokenId = String(tokenIdInput || "").trim();
        if (!tokenId)
            throw new AuthError("tokenId is required", 400);
        const record = this.store.getTokenById(tokenId);
        if (!record || record.userId !== expectedUserId) {
            throw new AuthError("Token not found", 404);
        }
        return record;
    }
    toUserPayload(user) {
        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            roles: this.store.listRoleNamesByUserId(user.id),
            permissions: this.store.listPermissionKeysByUserId(user.id),
        };
    }
}
//# sourceMappingURL=AuthService.js.map