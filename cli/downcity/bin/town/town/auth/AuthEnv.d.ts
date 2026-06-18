/**
 * AuthEnv：统一认证环境变量与 token 解析辅助模块。
 *
 * 关键点（中文）
 * - 收敛 `DC_AUTH_TOKEN` 的变量名与 Bearer 归一化逻辑。
 * - 通用子进程默认不继承任何 Bearer Token，避免隐式走本地 HTTP。
 */
/**
 * 用户显式覆盖 Bearer Token 的环境变量名。
 */
export declare const CLI_AUTH_TOKEN_ENV_KEY = "DC_AUTH_TOKEN";
/**
 * 归一化 Bearer Token。
 *
 * 关键点（中文）
 * - 允许传入纯 token 或 `Bearer xxx`。
 * - 空字符串与无效值统一归一化为 `null`。
 */
export declare function normalizeBearerToken(value: unknown): string | null;
/**
 * 解析本次调用应使用的 token。
 *
 * 优先级（中文）
 * 1. 显式传入 token
 * 2. 用户显式覆盖环境变量 `DC_AUTH_TOKEN`
 * 3. 调用方传入的本地存储 token
 */
export declare function resolveInvocationToken(params?: {
    explicitToken?: string;
    env?: NodeJS.ProcessEnv;
    storedToken?: string;
}): string | undefined;
/**
 * 从通用子进程环境中剥离 Bearer Token。
 *
 * 关键点（中文）
 * - shell / task script / ACP 等通用执行面不应默认继承任何 HTTP 鉴权信息。
 * - 这样可以避免这些链路因为环境变量而隐式带上本地/远程 HTTP 鉴权。
 */
export declare function stripInvocationAuthEnv(targetEnv: NodeJS.ProcessEnv): void;
/**
 * 生成标准 Authorization 头值。
 */
export declare function formatBearerHeaderValue(tokenInput: string | undefined): string | undefined;
//# sourceMappingURL=AuthEnv.d.ts.map