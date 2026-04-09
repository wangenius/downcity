/**
 * Plugin HTTP 路由装配。
 *
 * 关键点（中文）
 * - 这里统一装配内建 plugin 的 runtime HTTP 路由与鉴权策略。
 * - plugin 自己声明路由；server 与 console 只负责消费这份声明。
 */

import type { Hono } from "hono";
import { PLUGINS } from "@/main/plugin/Plugins.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { AuthRoutePolicy } from "@/shared/types/auth/AuthRoute.js";

function dedupeAuthPolicies(policies: AuthRoutePolicy[]): AuthRoutePolicy[] {
  const records = new Map<string, AuthRoutePolicy>();

  for (const policy of policies) {
    const key = `${String(policy.method || "*").trim().toUpperCase()}:${String(policy.path || "").trim()}`;
    if (!key.endsWith(":")) {
      records.set(key, policy);
    }
  }

  return [...records.values()];
}

/**
 * 列出全部内建 plugin runtime 鉴权策略。
 */
export function listBuiltinPluginRuntimeAuthPolicies(): AuthRoutePolicy[] {
  return dedupeAuthPolicies(
    PLUGINS.flatMap((plugin) => plugin.http?.runtime?.authPolicies || []),
  );
}

/**
 * 注册全部内建 plugin runtime HTTP 路由。
 */
export function registerBuiltinPluginHttpRoutes(params: {
  app: Hono;
  getContext: () => AgentContext;
}): void {
  for (const plugin of PLUGINS) {
    plugin.http?.runtime?.register({
      app: params.app,
      getContext: params.getContext,
      pluginName: plugin.name,
    });
  }
}
