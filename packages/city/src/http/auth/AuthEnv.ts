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
export const CLI_AUTH_TOKEN_ENV_KEY = "DC_AUTH_TOKEN";

/**
 * 归一化 Bearer Token。
 *
 * 关键点（中文）
 * - 允许传入纯 token 或 `Bearer xxx`。
 * - 空字符串与无效值统一归一化为 `null`。
 */
export function normalizeBearerToken(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(raw);
  const token = bearerMatch?.[1]?.trim() || raw;
  return token || null;
}

/**
 * 解析本次调用应使用的 token。
 *
 * 优先级（中文）
 * 1. 显式传入 token
 * 2. 用户显式覆盖环境变量 `DC_AUTH_TOKEN`
 * 3. 调用方传入的本地存储 token
 */
export function resolveInvocationToken(params: {
  explicitToken?: string;
  env?: NodeJS.ProcessEnv;
  storedToken?: string;
} = {}): string | undefined {
  const explicitToken = normalizeBearerToken(params.explicitToken);
  if (explicitToken) return explicitToken;

  const env = params.env || process.env;

  const envAuthToken = normalizeBearerToken(env[CLI_AUTH_TOKEN_ENV_KEY]);
  if (envAuthToken) return envAuthToken;

  return normalizeBearerToken(params.storedToken) || undefined;
}

/**
 * 从通用子进程环境中剥离 Bearer Token。
 *
 * 关键点（中文）
 * - shell / task script / ACP 等通用执行面不应默认继承任何 HTTP 鉴权信息。
 * - 这样可以强制这些链路优先走 RPC，而不是通过环境变量隐式改走本地 HTTP。
 */
export function stripInvocationAuthEnv(targetEnv: NodeJS.ProcessEnv): void {
  delete targetEnv[CLI_AUTH_TOKEN_ENV_KEY];
  delete targetEnv.DC_AGENT_TOKEN;
}

/**
 * 生成标准 Authorization 头值。
 */
export function formatBearerHeaderValue(tokenInput: string | undefined): string | undefined {
  const token = normalizeBearerToken(tokenInput);
  return token ? `Bearer ${token}` : undefined;
}
