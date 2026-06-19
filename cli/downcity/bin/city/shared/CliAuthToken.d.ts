/**
 * City CLI Bearer Token 解析模块。
 *
 * 关键点（中文）
 * - City 只需要解析显式 token 与环境变量 token。
 * - 不引入 City HTTP auth 模块，避免 City 包重新耦合 City 控制面。
 */
/**
 * 解析当前 CLI 应使用的 Bearer Token。
 */
export declare function resolveCliAuthToken(params?: {
    /**
     * 命令行显式传入的 token。
     */
    explicitToken?: string;
    /**
     * 可注入的环境变量对象，默认使用 `process.env`。
     */
    env?: NodeJS.ProcessEnv;
}): string | undefined;
/**
 * 生成标准 Authorization 头值。
 */
export declare function formatCliBearerHeaderValue(token_input: string | undefined): string | undefined;
//# sourceMappingURL=CliAuthToken.d.ts.map