/**
 * Bearer Token 工具。
 *
 * 关键点（中文）
 * - 明文 token 只在签发时生成一次。
 * - 存储层始终只保存哈希值，避免数据库泄漏时直接暴露访问凭证。
 */
/**
 * 生成新的明文 token。
 */
export declare function generateAccessToken(): string;
/**
 * 计算 token 哈希。
 */
export declare function hashAccessToken(tokenInput: string): string;
/**
 * 从 Authorization 头提取 Bearer Token。
 */
export declare function extractBearerToken(headerValue: string | undefined): string | null;
//# sourceMappingURL=TokenService.d.ts.map