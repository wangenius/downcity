/**
 * PluginRuntime：city 级 plugin 运行时注入模块。
 *
 * 关键点（中文）
 * - PluginRegistry / PluginManager 属于 city runtime，不应直接反向 import agent AgentContext 单例。
 * - 当前模块只负责保存“当前执行上下文 resolver”的注入入口。
 * - agent runtime 仅作为 context provider 注册方，不再成为 plugin manager 的宿主。
 */

import type { AgentContext } from "@/types/agent/AgentContext.js";

type AgentContextResolver = () => AgentContext;

let executionContextResolver: AgentContextResolver | null = null;

/**
 * 设置当前 city plugin runtime 的执行上下文 resolver。
 */
export function setPluginRuntimeContextResolver(
  resolver: AgentContextResolver,
): void {
  executionContextResolver = resolver;
}

/**
 * 清理当前 city plugin runtime 的执行上下文 resolver。
 */
export function clearPluginRuntimeContextResolver(): void {
  executionContextResolver = null;
}

/**
 * 读取当前 city plugin runtime 的执行上下文 resolver。
 */
export function getPluginRuntimeContextResolver(): AgentContextResolver {
  if (!executionContextResolver) {
    throw new Error(
      "Plugin runtime context resolver is not configured. Configure city plugin runtime before using PluginManager.",
    );
  }
  return executionContextResolver;
}
