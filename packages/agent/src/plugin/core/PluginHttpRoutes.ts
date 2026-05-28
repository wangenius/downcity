/**
 * PluginHttpRoutes：通用 plugin HTTP 声明装配工具。
 *
 * 关键点（中文）
 * - 这里只消费调用方传入的 plugin 集合，不关心 plugin 来源。
 * - HTTP route 与鉴权策略由 plugin 自己声明，宿主只负责收集和注册。
 */

import type { Hono } from "hono";
import type { Plugin } from "@/plugin/types/Plugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AuthRoutePolicy } from "@/types/runtime/auth/AuthRoute.js";

function dedupeAuthPolicies(policies: AuthRoutePolicy[]): AuthRoutePolicy[] {
  const records = new Map<string, AuthRoutePolicy>();
  for (const policy of policies) {
    const key = `${String(policy.method || "*").trim().toUpperCase()}:${String(policy.path || "").trim()}`;
    if (!key.endsWith(":")) records.set(key, policy);
  }
  return [...records.values()];
}

/**
 * 收集全部 plugin HTTP 鉴权策略。
 */
export function listPluginAuthPolicies(plugins: Iterable<Plugin>): AuthRoutePolicy[] {
  return dedupeAuthPolicies(
    [...plugins].flatMap((plugin) => plugin.http?.server?.authPolicies || []),
  );
}

/**
 * 注册全部 plugin HTTP 路由。
 */
export function registerPluginHttpRoutes(params: {
  app: Hono;
  getContext: () => AgentContext;
  plugins: Iterable<Plugin>;
}): void {
  for (const plugin of params.plugins) {
    plugin.http?.server?.register({
      app: params.app,
      getContext: params.getContext,
      pluginName: plugin.name,
    });
  }
}
