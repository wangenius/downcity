/**
 * Dashboard 路由注册类型定义。
 *
 * 关键点（中文）
 * - 统一描述 dashboard 数据面路由的公共依赖。
 * - 各路由模块共享同一份入参，避免重复声明与漂移。
 */

import type { Hono } from "hono";
import type { AgentState } from "@/shared/types/AgentState.js";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";

/**
 * Dashboard 路由注册入参。
 */
export interface DashboardRouteRegistrationParams {
  /**
   * Hono 应用实例。
   */
  app: Hono;

  /**
   * 读取当前 agent 状态。
   */
  getAgentState: () => AgentState;

  /**
   * 读取当前统一执行上下文。
   */
  getExecutionContext: () => ExecutionContext;
}
