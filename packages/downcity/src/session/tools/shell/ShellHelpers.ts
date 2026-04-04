/**
 * Shell 工具辅助函数。
 *
 * 关键点（中文）
 * - shell 会话生命周期已经迁移到 `shellService`。
 * - 这里仅保留当前仍被 tool 与测试复用的最小能力：命令安全校验与 env 注入。
 */

import { applyInternalAgentAuthEnv } from "@/main/modules/http/auth/AuthEnv.js";
import { requestContext } from "@session/RequestContext.js";

function setEnvString(
  env: NodeJS.ProcessEnv,
  key: string,
  value: string | undefined,
): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  env[key] = trimmed;
}

function applyEnvMap(
  env: NodeJS.ProcessEnv,
  entries?: Record<string, string>,
): void {
  if (!entries) return;
  for (const [rawKey, rawValue] of Object.entries(entries)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    setEnvString(env, key, rawValue);
  }
}

/**
 * 对 `city chat send` 命令做前置安全校验。
 *
 * 关键点（中文）
 * - 历史上模型会把长文本直接拼进多行 shell 命令，导致后续行被 zsh 当作独立命令解析。
 * - 这会出现“前面已发送，后面才报错”的副作用。
 * - 默认建议多行正文通过 `--stdin`、`--text-file` 或显式 `--text` 传入。
 */
export function validateChatSendCommand(cmd: string): string | null {
  const source = String(cmd ?? "");
  if (!/\b(?:city|downcity)\s+chat\s+send\b/.test(source)) return null;
  if (!/[\r\n]/.test(source)) return null;
  if (/\b(?:city|downcity)\s+chat\s+send\b[\s\S]*\s--stdin(?:\s|$)/.test(source)) {
    return null;
  }
  if (/\b(?:city|downcity)\s+chat\s+send\b[\s\S]*\s--text(?:\s|$)/.test(source)) {
    return null;
  }
  if (/\b(?:city|downcity)\s+chat\s+send\b[\s\S]*\s--text-file(?:\s|$)/.test(source)) {
    return null;
  }
  return [
    "Unsafe `city chat send` command: real newlines are not allowed.",
    "If your message is multi-line, use `city chat send --stdin` (with heredoc/pipe), `--text-file`, or explicit `--text`.",
  ].join(" ");
}

/**
 * 构建 shell 子进程环境变量。
 *
 * 关键点（中文）
 * - 当前仍用于 shell tool/service 与相关测试。
 * - 优先级：显式注入 > 当前请求上下文变量 > 宿主进程环境。
 */
export function buildShellContextEnv(
  injected?: Record<string, string>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const contextCtx = requestContext.getStore();

  applyEnvMap(env, injected);
  setEnvString(env, "DC_SESSION_ID", contextCtx?.sessionId);
  setEnvString(env, "DC_CTX_REQUEST_ID", contextCtx?.requestId);
  setEnvString(env, "DC_CTX_SERVER_HOST", process.env.DC_SERVER_HOST);
  setEnvString(env, "DC_CTX_SERVER_PORT", process.env.DC_SERVER_PORT);

  applyInternalAgentAuthEnv({
    targetEnv: env,
    sourceEnv: process.env,
  });

  return env;
}
