/**
 * Service 注册契约类型（console/service）。
 *
 * 关键点（中文）
 * - 该类型属于进程编排层，用于承接 service runtime 注册与调度
 * - 一个 service 由多个 action 组成，console 宿主层只做统一注册与分发
 */

import type { Command } from "commander";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import type { Context as HonoContext } from "hono";

/**
 * 服务运行状态。
 */
export type ServiceRuntimeState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

/**
 * 服务命令执行结果。
 */
export type ServiceCommandResult = {
  success: boolean;
  message?: string;
  data?: JsonValue;
};

/**
 * Action 执行结果。
 */
export type ServiceActionResult<R extends JsonValue = JsonValue> = {
  success: boolean;
  data?: R;
  error?: string;
};

/**
 * Action 命令输入。
 */
export type ServiceActionCommandInput = {
  args: string[];
  opts: Record<string, JsonValue>;
};

/**
 * Action CLI 定义。
 */
export type ServiceActionCommand<P extends JsonValue = JsonValue> = {
  description: string;
  configure?: (command: Command) => void;
  mapInput: (input: ServiceActionCommandInput) => P | Promise<P>;
};

/**
 * Action HTTP 定义。
 */
export type ServiceActionApi<P extends JsonValue = JsonValue> = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path?: string;
  mapInput?: (ctx: HonoContext) => P | Promise<P>;
};

/**
 * Service action 定义。
 */
export type ServiceAction<
  P extends JsonValue = JsonValue,
  R extends JsonValue = JsonValue,
> = {
  command?: ServiceActionCommand<P>;
  api?: ServiceActionApi<P>;
  execute: (params: {
    context: ServiceRuntime;
    payload: P;
    serviceName: string;
    actionName: string;
  }) => Promise<ServiceActionResult<R>> | ServiceActionResult<R>;
};

/**
 * Service actions 映射（对象结构）。
 *
 * 关键点（中文）
 * - key 即 action 名称
 * - 不使用数组，便于直接按名称索引与调度
 */
export type ServiceActions = {
  [actionName: string]: ServiceAction<JsonValue, JsonValue>;
};

/**
 * 服务生命周期扩展能力。
 */
export interface ServiceLifecycle {
  start?(context: ServiceRuntime): Promise<void> | void;
  stop?(context: ServiceRuntime): Promise<void> | void;
  command?(params: {
    context: ServiceRuntime;
    command: string;
    payload?: JsonValue;
  }): Promise<ServiceCommandResult> | ServiceCommandResult;
}

/**
 * Service：服务统一契约。
 */
export interface Service {
  name: string;
  /**
   * action 模型（唯一模型）。
   *
   * 关键点（中文）
   * - 一个 service 对应多个 action
   * - main 自动注册 CLI 与 HTTP 路由（默认 `/service/<service>/<action>`）
   */
  actions: ServiceActions;
  /**
   * service 级 system 文本构建器（可选）。
   *
   * 关键点（中文）
   * - 由 service 声明一个 `system(context)` 函数，直接返回文本。
   * - 返回空串表示该 service 无额外 system 注入。
   */
  system?: (context: ServiceRuntime) => string | Promise<string>;
  lifecycle?: ServiceLifecycle;
}
