/**
 * Plugin 注册状态类型。
 *
 * 关键点（中文）
 * - Plugin 只属于 Agent：注册即生效，卸载即不可见。
 * - 不再暴露 start / stop / restart 这类生命周期状态。
 * - `error` 只表示最近一次注册后运行发生错误，方便开发者诊断。
 */

import type { Plugin } from "@/types/plugin/PluginDefinition.js";

/**
 * Plugin 当前可观察状态。
 */
export type PluginState = "ready" | "error";

/**
 * 单个已注册 plugin 的运行时记录。
 */
export interface PluginRuntimeRecord {
  /** 当前 plugin 实例。 */
  plugin: Plugin;
  /** 当前可观察状态。 */
  state: PluginState;
  /** plugin 注册时间（毫秒时间戳）。 */
  registered_at: number;
  /** 最近一次状态更新时间（毫秒时间戳）。 */
  updated_at: number;
  /** 最近一次错误信息。 */
  last_error?: string;
  /** 当前串行变更链。 */
  chain: Promise<void>;
  /** lifecycle.start 是否已经执行成功。 */
  lifecycle_started: boolean;
}

/**
 * 单个 plugin 注册快照。
 */
export interface PluginSnapshot {
  /** plugin 名称。 */
  name: string;
  /** plugin 标题。 */
  title: string;
  /** plugin 描述。 */
  description: string;
  /** 当前注册后的可用状态。 */
  status: PluginState;
  /** 注册时间（毫秒时间戳）。 */
  registered_at: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updated_at: number;
  /** 最近错误。 */
  last_error?: string;
}

/**
 * Plugin 控制动作。
 */
export type PluginControlAction = "unregister" | "status";

/**
 * plugin 控制结果。
 */
export interface PluginControlResult {
  /** 控制动作是否成功。 */
  success: boolean;
  /** 成功或失败后返回的最新 plugin 快照。 */
  plugin?: PluginSnapshot;
  /** 失败时的错误信息。 */
  error?: string;
}
