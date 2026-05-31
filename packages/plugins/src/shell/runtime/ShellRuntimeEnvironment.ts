/**
 * Shell action 运行环境解析辅助。
 *
 * 关键点（中文）
 * - 集中处理 shell 子进程 cwd、env 与 owner context 的解析。
 * - 这里只做输入归一化，不持有 shell session 状态。
 */

import path from "node:path";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { stripInvocationAuthEnv } from "@downcity/agent/internal/runtime/server/http/auth/AuthEnv.js";
import { getSessionRunScope } from "@downcity/agent/internal/executor/SessionRunScope.js";

/**
 * 构造 shell 子进程环境变量。
 */
export function buildShellEnv(context: AgentContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // 关键点（中文）
  // - AgentContext.env 现在就是宿主已经整理好的最终 env 视图。
  // - shell 只消费这一份显式上下文，避免再次引入 platform/global env 隐式来源。
  for (const [key, value] of Object.entries(context.env || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  const request = getSessionRunScope();
  const sessionId = String(request?.sessionId || "").trim();
  const agentPath = String(context.rootPath || "").trim();
  const configuredAgentId = String(context.config?.id || "").trim();
  const agentId = configuredAgentId || (agentPath ? path.basename(agentPath) : "");

  // 关键点（中文）
  // - agent 自己在 shell 里执行 `bay <service> ...` 时，也需要显式知道“当前 agent 是谁”。
  // - 否则 service CLI 会退回到当前终端 cwd / registry 猜测，在多 agent 或外部工作目录下
  //   很容易把请求发到错误项目，最终误报 “Agent server 没启动”。
  if (agentPath) env.DC_AGENT_PATH = agentPath;
  if (agentId) env.DC_AGENT_ID = agentId;
  if (sessionId) env.DC_SESSION_ID = sessionId;
  if (process.env.DC_CITY_HOST) env.DC_CITY_HOST = process.env.DC_CITY_HOST;
  if (process.env.DC_CITY_PORT) env.DC_CITY_PORT = process.env.DC_CITY_PORT;
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
