/**
 * 解析 sessionId。
 *
 * 优先级（中文）
 * 1) 显式参数 `input.sessionId`
 * 2) `DC_SESSION_ID`
 * 3) `DC_CTX_CONTEXT_ID`
 */
export function resolveSessionId(input?: {
  sessionId?: string;
}): string | undefined {
  const explicit = String(input?.sessionId || "").trim();
  if (explicit) return explicit;

  const envSessionId = String(process.env.DC_SESSION_ID || "").trim();
  if (envSessionId) return envSessionId;

  const envLegacyContextId = String(process.env.DC_CTX_CONTEXT_ID || "").trim();
  if (envLegacyContextId) return envLegacyContextId;

  return undefined;
}
