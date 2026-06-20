/**
 * Token 生命周期动作模块。
 *
 * 关键点（中文）
 * - 封装 token 的创建、删除与查询。
 * - 每个动作都自行管理 AuthService 生命周期。
 */
import type { AuthIssuedToken, AuthTokenSummary } from "@downcity/agent";
/**
 * 创建新的本地 CLI token。
 */
export declare function createToken(params: {
    name: string;
    expiresAt?: string;
    json?: boolean;
}): AuthIssuedToken;
/**
 * 删除指定 token。
 */
export declare function deleteToken(tokenId: string, json?: boolean): void;
/**
 * 加载所有本地 CLI token 摘要。
 */
export declare function loadLocalCliTokens(): AuthTokenSummary[];
//# sourceMappingURL=TokenActions.d.ts.map