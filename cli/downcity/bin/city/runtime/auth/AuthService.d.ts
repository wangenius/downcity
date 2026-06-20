/**
 * 统一账户服务层。
 *
 * 关键点（中文）
 * - 该模块承接本机 token 初始化、token 校验与 token 管理等业务语义。
 * - 路由层只调用这里，不直接碰数据库与密码哈希细节。
 */
import type { AuthIssuedToken, AuthTokenSummary } from "@downcity/agent";
import type { AuthPrincipal } from "@downcity/agent";
import { AuthStore, type AuthStoreOptions } from "../../../city/runtime/auth/AuthStore.js";
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
export declare class AuthService {
    private readonly store;
    private readonly ownsStore;
    constructor(options?: AuthServiceOptions);
    /**
     * 关闭底层连接。
     */
    close(): void;
    /**
     * 判断当前是否已经存在可用的本机 CLI access token。
     */
    hasLocalCliAccess(): boolean;
    /**
     * 确保存在本机 CLI 主体，并为其签发新的 access token。
     */
    ensureLocalCliAccess(input: {
        tokenName: string;
        expiresAt?: string;
    }): {
        user: AuthCurrentUserPayload;
        token: AuthIssuedToken;
    };
    /**
     * 读取本机 CLI 主体的 token 列表。
     */
    listLocalCliTokens(): AuthTokenSummary[];
    /**
     * 为本机 CLI 主体签发新的 access token。
     */
    createLocalCliToken(input: {
        name: string;
        expiresAt?: string;
    }): AuthIssuedToken;
    /**
     * 删除本机 CLI 主体下的 token。
     */
    deleteLocalCliToken(tokenIdInput: string): void;
    /**
     * 解析 Authorization 头并返回 principal。
     */
    authenticateBearerHeader(headerValue: string | undefined): AuthPrincipal;
    /**
     * 返回当前用户信息。
     */
    getCurrentUser(principal: AuthPrincipal): AuthCurrentUserPayload;
    /**
     * 为当前 Bearer 调用主体创建新的 token。
     */
    createToken(principal: AuthPrincipal, input: {
        name: string;
        expiresAt?: string;
    }): AuthIssuedToken;
    /**
     * 读取当前用户 token 列表。
     */
    listTokens(principal: AuthPrincipal): AuthTokenSummary[];
    /**
     * 删除当前用户的 token。
     */
    deleteToken(principal: AuthPrincipal, tokenIdInput: string): void;
    private issueTokenForUser;
    private ensureUserActive;
    private isTokenActive;
    private ensureLocalCliUser;
    private requireTokenName;
    private requireLocalCliUser;
    private requireLocalCliTokenRecord;
    private toUserPayload;
}
//# sourceMappingURL=AuthService.d.ts.map