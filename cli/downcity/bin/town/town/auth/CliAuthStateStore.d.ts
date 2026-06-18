/**
 * CLI Bearer Token 解析模块。
 *
 * 关键点（中文）
 * - 只解析显式 token 与环境变量 token，不再读取任何本机持久化默认值。
 * - 这样远程 HTTP 鉴权始终是显式行为，不会出现本地“兜底复用”。
 */
/**
 * Bearer Token 解析参数。
 */
export interface CliAuthStateStoreOptions {
    /**
     * 保留参数形状，当前不再使用本地存储。
     */
    dbPath?: string;
}
/**
 * 解析当前 CLI 应使用的 Bearer Token。
 *
 * 优先级（中文）
 * 1. 显式传入 token
 * 2. 环境变量 `DC_AUTH_TOKEN`
 */
export declare function resolveCliAuthToken(params?: {
    explicitToken?: string;
    env?: NodeJS.ProcessEnv;
    dbPath?: string;
}): string | undefined;
/**
 * 生成标准 Authorization 头值。
 */
export declare function formatCliBearerHeaderValue(tokenInput: string | undefined): string | undefined;
//# sourceMappingURL=CliAuthStateStore.d.ts.map