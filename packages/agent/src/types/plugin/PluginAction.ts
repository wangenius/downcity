/**
 * Plugin action 类型。
 *
 * 关键点（中文）
 * - action 是 plugin 对外暴露的显式能力。
 * - CLI / HTTP 只是 action 的输入适配层，真正执行器统一走 `execute`。
 */

import type { Command } from "commander";
import type { Context as HonoContext } from "hono";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonValue } from "@/types/common/Json.js";

/**
 * Plugin action 调用参数。
 */
export interface PluginActionInvokeParams {
  /** 目标 plugin 名称。 */
  plugin: string;
  /** 目标 action 名称。 */
  action: string;
  /** 调用 payload（可选）。 */
  payload?: JsonValue;
}

/**
 * Plugin action 调用结果。
 */
export interface PluginActionInvokeResult {
  /** 调用是否成功。 */
  success: boolean;
  /** 结构化返回数据（可选）。 */
  data?: JsonValue;
  /** 错误信息（可选）。 */
  error?: string;
}

/**
 * Plugin action 调用端口。
 */
export interface PluginActionInvokePort {
  /** 调用指定 plugin action。 */
  invoke(
    params: PluginActionInvokeParams,
  ): Promise<PluginActionInvokeResult>;
}

/**
 * Plugin Action 执行结果。
 */
export interface PluginActionResult<R extends JsonValue = JsonValue> {
  /** Action 是否成功。 */
  success: boolean;
  /** 返回数据（可选）。 */
  data?: R;
  /** 错误信息（可选）。 */
  error?: string;
  /** 人类可读消息（可选）。 */
  message?: string;
}

/**
 * Plugin Action 命令输入。
 */
export interface PluginActionCommandInput {
  /** 位置参数列表。 */
  args: string[];
  /** 选项参数对象。 */
  opts: Record<string, JsonValue>;
}

/**
 * Plugin Action CLI 定义。
 */
export interface PluginActionCommand<P extends JsonValue = JsonValue> {
  /** 命令说明。 */
  description: string;
  /** 额外 commander 配置（可选）。 */
  configure?: (command: Command) => void;
  /** 将 CLI 输入映射为 payload。 */
  mapInput: (input: PluginActionCommandInput) => P | Promise<P>;
}

/**
 * Plugin Action HTTP 定义。
 */
export interface PluginActionApi<P extends JsonValue = JsonValue> {
  /** HTTP 方法。 */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** HTTP 路径。 */
  path?: string;
  /** 将 HTTP 输入映射为 payload（可选）。 */
  mapInput?: (ctx: HonoContext) => P | Promise<P>;
}

/**
 * Plugin Action 定义。
 */
export interface PluginAction<
  P extends JsonValue = JsonValue,
  R extends JsonValue = JsonValue,
> {
  /**
   * disabled 状态下是否仍允许执行。
   *
   * 说明（中文）
   * - 用于 `on` / `status` / `models` / `configure` / `install` 这类 setup 相关 action。
   * - 默认 false，避免 disabled plugin 绕过 registry 保护执行普通业务 action。
   */
  allowWhenDisabled?: boolean;
  /** CLI 定义（可选）。 */
  command?: PluginActionCommand<P>;
  /** HTTP 定义（可选）。 */
  api?: PluginActionApi<P>;
  /** Action 执行器。 */
  execute: (params: {
    /** 当前执行上下文。 */
    context: AgentContext;
    /** 输入 payload。 */
    payload: P;
    /** 当前插件名称。 */
    pluginName: string;
    /** 当前 Action 名称。 */
    actionName: string;
  }) => Promise<PluginActionResult<R>> | PluginActionResult<R>;
}

/**
 * Plugin Action 集合。
 */
export type PluginActions = {
  [actionName: string]: PluginAction<JsonValue, JsonValue>;
};
