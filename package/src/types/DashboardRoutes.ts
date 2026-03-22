/**
 * Dashboard 路由注册类型定义。
 *
 * 关键点（中文）
 * - 统一描述 dashboard 数据面路由的公共依赖。
 * - 各路由模块共享同一份入参，避免重复声明与漂移。
 */

import type { Hono } from "hono";
import type { RuntimeState } from "@/agent/context/manager/RuntimeState.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";

/**
 * Dashboard 路由注册入参。
 */
export interface DashboardRouteRegistrationParams {
  /**
   * Hono 应用实例。
   */
  app: Hono;

  /**
   * 读取当前 runtime 状态。
   */
  getRuntimeState: () => RuntimeState;

  /**
   * 读取当前 service runtime 状态。
   */
  getServiceRuntimeState: () => ServiceRuntime;
}
