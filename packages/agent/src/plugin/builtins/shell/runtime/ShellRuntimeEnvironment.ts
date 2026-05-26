/**
 * Shell action 运行环境解析辅助。
 *
 * 关键点（中文）
 * - 集中处理 shell 子进程 cwd、env 与 owner context 的解析。
 * - 这里只做输入归一化，不持有 shell session 状态。
 */

import path from "node:path";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import { stripInvocationAuthEnv } from "@/runtime/server/http/auth/AuthEnv.js";
import { getSessionRunScope } from "@executor/SessionRunScope.js";

/**
 * 构造 shell 子进程环境变量。
 */
export function buildShellEnv(context: AgentContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // 关键点（中文）
  // - shell 子进程需要继承平台级 global env。
  // - 这里显式从 store 读取，避免把 AgentContext.env 语义扩大成“全局+agent 混合态”。
  // - 冲突时仍由后续 agent 私有 env 覆盖，保持文档声明的优先级。
  for (const [key, value] of Object.entries(context.globalEnv || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(context.env || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  const request = getSessionRunScope();
  const sessionId = String(request?.sessionId || "").trim();
  const agentPath = String(context.rootPath || "").trim();
  const configuredAgentName = String(context.config?.name || "").trim();
  const agentName = configuredAgentName || (agentPath ? path.basename(agentPath) : "");

  // 关键点（中文）
  // - agent 自己在 shell 里执行 `city <service> ...` 时，也需要显式知道“当前 agent 是谁”。
  // - 否则 service CLI 会退回到当前终端 cwd / registry 猜测，在多 agent 或外部工作目录下
  //   很容易把请求发到错误项目，最终误报 “Agent server 没启动”。
  if (agentPath) env.DC_AGENT_PATH = agentPath;
  if (agentName) env.DC_AGENT_NAME = agentName;
  if (sessionId) env.DC_SESSION_ID = sessionId;
  if (process.env.DC_SERVER_HOST) env.DC_CTX_SERVER_HOST = process.env.DC_SERVER_HOST;
  if (process.env.DC_SERVER_PORT) env.DC_CTX_SERVER_PORT = process.env.DC_SERVER_PORT;
  stripInvocationAuthEnv(env);

  return env;
}

/**
 * 解析 shell 执行目录。
 */
export function resolveShellCwd(context: AgentContext, cwd?: string): string {
  const raw = String(cwd || "").trim();
  if (!raw) return context.rootPath;
  return path.isAbsolute(raw) ? raw : path.resolve(context.rootPath, raw);
}

/**
 * 推断 shell 所属的 owner context。
 */
export function resolveOwnerContextId(explicit?: string): string | undefined {
  const fromInput = String(explicit || "").trim();
  if (fromInput) return fromInput;
  const fromRequest = String(getSessionRunScope()?.sessionId || "").trim();
  return fromRequest || undefined;
}
