/**
 * Town CLI Bearer Token 解析模块。
 *
 * 关键点（中文）
 * - Town 只需要解析显式 token 与环境变量 token。
 * - 不引入 City HTTP auth 模块，避免 Town 包重新耦合 City 控制面。
 */
const CLI_AUTH_TOKEN_ENV_KEY = "DC_AUTH_TOKEN";
/**
 * 解析当前 CLI 应使用的 Bearer Token。
 */
export function resolveCliAuthToken(params = {}) {
    const explicit_token = String(params.explicitToken || "").trim();
    if (explicit_token)
        return explicit_token;
    const env = params.env || process.env;
    const env_token = String(env[CLI_AUTH_TOKEN_ENV_KEY] || "").trim();
    return env_token || undefined;
}
/**
 * 生成标准 Authorization 头值。
 */
export function formatCliBearerHeaderValue(token_input) {
    const token = String(token_input || "").trim();
    if (!token)
        return undefined;
    if (/^Bearer\s+/i.test(token))
        return token;
    return `Bearer ${token}`;
}
//# sourceMappingURL=CliAuthToken.js.map