/**
 * Extension 注册契约类型（console/extension）。
 *
 * 关键点（中文）
 * - Extension 是 service 之下的能力层，供 service 复用（server -> service -> extension）。
 * - console 只负责统一注册与调度，不把业务逻辑放在编排层。
 */

import type { Command } from "commander";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import type { Context as HonoContext } from "hono";

/**
 * Extension 运行状态。
 */
export type ExtensionRuntimeState =
  | "running"
  | "idle"
  | "starting"
  | "stopping"
  | "error";

/**
 * Extension 命令执行结果。
 */
export type ExtensionCommandResult = {
  success: boolean;
  message?: string;
  data?: JsonValue;
};

/**
 * Extension Action 执行结果。
 */
export type ExtensionActionResult<R extends JsonValue = JsonValue> = {
  success: boolean;
  data?: R;
  error?: string;
};

/**
 * Extension Action 命令输入。
 */
export type ExtensionActionCommandInput = {
  args: string[];
  opts: Record<string, JsonValue>;
};

/**
 * Extension Action CLI 定义。
 */
export type ExtensionActionCommand<P extends JsonValue = JsonValue> = {
  description: string;
  configure?: (command: Command) => void;
  mapInput: (input: ExtensionActionCommandInput) => P | Promise<P>;
};

/**
 * Extension Action HTTP 定义。
 */
export type ExtensionActionApi<P extends JsonValue = JsonValue> = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path?: string;
  mapInput?: (ctx: HonoContext) => P | Promise<P>;
};

/**
 * Extension Action 定义。
 */
export type ExtensionAction<
  P extends JsonValue = JsonValue,
  R extends JsonValue = JsonValue,
> = {
  command?: ExtensionActionCommand<P>;
  api?: ExtensionActionApi<P>;
  execute: (params: {
    context: ServiceRuntime;
    payload: P;
    extensionName: string;
    actionName: string;
  }) => Promise<ExtensionActionResult<R>> | ExtensionActionResult<R>;
};

/**
 * Extension actions 映射（对象结构）。
 *
 * 关键点（中文）
 * - key 即 action 名称。
 * - 使用对象索引，便于按名称执行和桥接 CLI/API。
 */
export type ExtensionActions = {
  [actionName: string]: ExtensionAction<JsonValue, JsonValue>;
};

/**
 * Extension 生命周期扩展能力。
 */
export interface ExtensionLifecycle {
  start?(context: ServiceRuntime): Promise<void> | void;
  stop?(context: ServiceRuntime): Promise<void> | void;
  command?(params: {
    context: ServiceRuntime;
    command: string;
    payload?: JsonValue;
  }): Promise<ExtensionCommandResult> | ExtensionCommandResult;
}

/**
 * Extension：统一能力契约。
 */
export interface Extension {
  /**
   * Extension 稳定名称。
   */
  name: string;
  /**
   * Extension 描述（用于 UI 展示）。
   */
  description?: string;
  /**
   * Action 集合。
   */
  actions: ExtensionActions;
  /**
   * 生命周期钩子（可选）。
   */
  lifecycle?: ExtensionLifecycle;
}
