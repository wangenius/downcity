/**
 * 统一账户存储层。
 *
 * 关键点（中文）
 * - 该模块只负责 `auth_*` 表的读写，不处理密码校验与 HTTP 语义。
 * - 数据仍落在控制面全局 SQLite 中，与现有平台配置共享底层存储。
 */
import type { AuthIssuedToken, AuthTokenSummary } from "@downcity/agent";
import { type AuthDefaultRoleName, type AuthPermissionKey } from "@downcity/agent";
import type { AuthAuditLog, AuthTokenRecord, AuthUser } from "@downcity/agent";
/**
 * AuthStore 构造参数。
 */
export interface AuthStoreOptions {
    /**
     * SQLite 数据库路径。
     */
    dbPath?: string;
}
/**
 * AuthStore 门面。
 */
export declare class AuthStore {
    private readonly sqlite;
    private readonly context;
    constructor(options?: AuthStoreOptions);
    /**
     * 关闭数据库连接。
     */
    close(): void;
    /**
     * 返回当前用户数量。
     */
    countUsers(): number;
    /**
     * 幂等写入默认角色与权限目录。
     */
    ensureDefaultCatalog(): void;
    /**
     * 创建用户。
     */
    createUser(input: {
        username: string;
        passwordHash: string;
        displayName?: string;
        status?: "active" | "disabled";
    }): AuthUser;
    /**
     * 根据用户名读取用户。
     */
    findUserByUsername(usernameInput: string): AuthUser | null;
    /**
     * 根据用户 ID 读取用户。
     */
    getUserById(userIdInput: string): AuthUser | null;
    /**
     * 读取全部用户列表。
     */
    listUsers(): AuthUser[];
    /**
     * 更新用户基础资料。
     */
    updateUser(params: {
        userId: string;
        displayName?: string;
        status?: "active" | "disabled";
    }): AuthUser | null;
    /**
     * 更新用户密码哈希。
     */
    updateUserPasswordHash(params: {
        userId: string;
        passwordHash: string;
    }): AuthUser | null;
    /**
     * 给用户绑定角色。
     */
    assignRoleToUser(params: {
        userId: string;
        roleName: AuthDefaultRoleName | string;
    }): void;
    /**
     * 读取用户角色名列表。
     */
    listRoleNamesByUserId(userIdInput: string): string[];
    /**
     * 清空用户当前绑定的全部角色。
     */
    clearRolesByUserId(userIdInput: string): void;
    /**
     * 用新的角色集合覆盖用户角色绑定。
     */
    replaceRolesByUserId(params: {
        userId: string;
        roleNames: string[];
    }): string[];
    /**
     * 统计拥有指定角色且处于 active 状态的用户数量。
     */
    countActiveUsersByRole(roleNameInput: string): number;
    /**
     * 读取用户权限 key 列表。
     */
    listPermissionKeysByUserId(userIdInput: string): AuthPermissionKey[];
    /**
     * 创建 token 记录。
     */
    createToken(input: {
        userId: string;
        name: string;
        tokenHash: string;
        expiresAt?: string;
    }): AuthTokenRecord;
    /**
     * 根据 token 哈希读取记录。
     */
    findTokenByHash(tokenHashInput: string): AuthTokenRecord | null;
    /**
     * 根据 token ID 读取记录。
     */
    getTokenById(tokenIdInput: string): AuthTokenRecord | null;
    /**
     * 读取用户 token 列表。
     */
    listTokensByUserId(userIdInput: string): AuthTokenRecord[];
    /**
     * 更新 token 最后使用时间。
     */
    touchToken(tokenIdInput: string): void;
    /**
     * 吊销 token。
     */
    revokeToken(tokenIdInput: string): AuthTokenRecord | null;
    /**
     * 删除 token。
     */
    deleteToken(tokenIdInput: string): boolean;
    /**
     * 写入审计日志。
     */
    insertAuditLog(input: {
        actorUserId?: string;
        actorTokenId?: string;
        resourceType: string;
        resourceId?: string;
        action: string;
        result: string;
        requestId?: string;
        ip?: string;
        userAgent?: string;
        metaJson?: string;
    }): AuthAuditLog;
    /**
     * 将 token 记录转换为对外摘要。
     */
    toTokenSummary(record: AuthTokenRecord): AuthTokenSummary;
    /**
     * 将 token 记录与明文 token 合成为一次性返回体。
     */
    toIssuedToken(record: AuthTokenRecord, token: string): AuthIssuedToken;
    private toAuthUser;
    private toAuthToken;
}
//# sourceMappingURL=AuthStore.d.ts.map