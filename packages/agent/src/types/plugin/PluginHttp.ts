/**
 * Plugin HTTP 注入类型。
 *
 * 关键点（中文）
 * - plugin 只声明自己的路由与鉴权策略。
 * - server 装配、代理和鉴权执行仍由宿主负责。
 */

import type { Hono } from "hono";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AuthRoutePolicy } from "@/types/runtime/auth/AuthRoute.js";

/**
 * Plugin HTTP 注入参数。
 */
export interface PluginHttpRegistration {
  /** 该组路由对应的鉴权策略列表。 */
  authPolicies?: AuthRoutePolicy[];
  /** 向 runtime Hono 应用注册路由。 */
  register(params: {
    /** 当前 Hono 应用实例。 */
    app: Hono;
    /** 获取当前统一执行上下文。 */
    getContext: () => AgentContext;
    /** 当前 plugin 稳定名称。 */
    pluginName: string;
  }): void;
}

/**
 * Plugin HTTP 注入定义。
 */
export interface PluginHttpDefinition {
  /** server HTTP 路由注入（可选）。 */
  server?: PluginHttpRegistration;
}
