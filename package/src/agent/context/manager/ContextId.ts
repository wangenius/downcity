/**
 * 解析 contextId。
 *
 * 优先级（中文）
 * 1) 显式参数 `input.contextId`
 * 2) `DC_CTX_CONTEXT_ID`
 */
export function resolveContextId(input?: {
  contextId?: string;
}): string | undefined {
  const explicit = String(input?.contextId || "").trim();
  if (explicit) return explicit;

  const envContextId = String(process.env.DC_CTX_CONTEXT_ID || "").trim();
  if (envContextId) return envContextId;

  return undefined;
}

