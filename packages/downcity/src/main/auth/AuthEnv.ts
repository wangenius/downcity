/**
 * AuthEnv：统一认证环境变量与 token 解析辅助模块。
 *
 * 关键点（中文）
 * - 收敛 `DC_AUTH_TOKEN` / `DC_AGENT_TOKEN` 的变量名与优先级定义。
 * - 用户显式覆盖仍走 `DC_AUTH_TOKEN`；agent 内部传播统一走 `DC_AGENT_TOKEN`。
 * - 所有 CLI / shell / ACP 子进程都复用同一份 token 归一化与 env 注入逻辑。
 */

/**
 * 用户显式覆盖 Bearer Token 的环境变量名。
 */
export const CLI_AUTH_TOKEN_ENV_KEY = "DC_AUTH_TOKEN";

/**
 * Agent 进程内部传播 Bearer Token 的环境变量名。
 */
export const AGENT_AUTH_TOKEN_ENV_KEY = "DC_AGENT_TOKEN";

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
 * 3. Agent 内部传播环境变量 `DC_AGENT_TOKEN`
 * 4. 调用方传入的本地存储 token
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

  const agentToken = normalizeBearerToken(env[AGENT_AUTH_TOKEN_ENV_KEY]);
  if (agentToken) return agentToken;

  return normalizeBearerToken(params.storedToken) || undefined;
}

/**
 * 向目标环境变量集中注入 Agent token。
 *
 * 关键点（中文）
 * - 只传播 `DC_AGENT_TOKEN`，不再自动合成 `DC_AUTH_TOKEN`。
 * - `DC_AUTH_TOKEN` 保留给用户显式覆盖，不作为内部隐式桥接变量。
 */
export function injectAgentTokenIntoEnv(params: {
  targetEnv: NodeJS.ProcessEnv;
  sourceEnv?: NodeJS.ProcessEnv;
  token?: string;
}): void {
  const token =
    normalizeBearerToken(params.token) ||
    normalizeBearerToken((params.sourceEnv || process.env)[AGENT_AUTH_TOKEN_ENV_KEY]);
  if (!token) return;
  params.targetEnv[AGENT_AUTH_TOKEN_ENV_KEY] = token;
}

/**
 * 为 agent 内部子进程应用统一认证环境。
 *
 * 关键点（中文）
 * - 内部链路应始终使用 `DC_AGENT_TOKEN`，不允许继承宿主 shell 的 `DC_AUTH_TOKEN`。
 * - 否则用户外部显式覆盖会渗透到 agent 内部自动化路径，导致“内部身份”漂移。
 */
export function applyInternalAgentAuthEnv(params: {
  targetEnv: NodeJS.ProcessEnv;
  sourceEnv?: NodeJS.ProcessEnv;
  token?: string;
}): void {
  delete params.targetEnv[CLI_AUTH_TOKEN_ENV_KEY];
  injectAgentTokenIntoEnv(params);
}

/**
 * 生成标准 Authorization 头值。
 */
export function formatBearerHeaderValue(tokenInput: string | undefined): string | undefined {
  const token = normalizeBearerToken(tokenInput);
  return token ? `Bearer ${token}` : undefined;
}
