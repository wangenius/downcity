/**
 * Plugin 状态类型。
 *
 * 关键点（中文）
 * - 只描述 plugin 生命周期状态与控制结果。
 * - 不包含 command/action/hook 等执行协议，避免状态类型被运行时细节污染。
 */

/**
 * Plugin 运行状态。
 *
 * 说明（中文）
 * - `starting` / `stopping` 仅用于生命周期过渡态。
 * - `error` 表示最近一次 lifecycle / command / action 执行失败后留下的状态标记。
 */
export type PluginState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

/**
 * 单个 plugin 实例内部持有的状态记录。
 */
export interface PluginStateRecord {
  /** 当前运行状态。 */
  state: PluginState;
  /** 最近一次状态更新时间（毫秒时间戳）。 */
  updatedAt: number;
  /** 最近一次错误信息。 */
  lastError?: string;
  /** 最近一次执行的命令名。 */
  lastCommand?: string;
  /** 最近一次执行命令的时间（毫秒时间戳）。 */
  lastCommandAt?: number;
  /** 当前串行控制链。 */
  chain: Promise<void>;
}

/**
 * 单个 plugin 状态的对外快照。
 */
export interface PluginStateSnapshot {
  /** plugin 名称。 */
  name: string;
  /** 当前运行状态。 */
  state: PluginState;
  /** 最近一次状态更新时间（毫秒时间戳）。 */
  updatedAt: number;
  /** 最近一次错误信息。 */
  lastError?: string;
  /** 最近一次执行的命令名。 */
  lastCommand?: string;
  /** 最近一次执行命令的时间（毫秒时间戳）。 */
  lastCommandAt?: number;
  /** 是否支持主动生命周期。 */
  supportsLifecycle: boolean;
  /** 是否支持 command/action。 */
  supportsCommand: boolean;
}

/**
 * plugin 状态控制动作。
 */
export type PluginStateControlAction =
  | "start"
  | "stop"
  | "restart"
  | "status";

/**
 * plugin 状态控制结果。
 */
export interface PluginStateControlResult {
  /** 控制动作是否成功。 */
  success: boolean;
  /** 成功或失败后返回的最新 plugin 快照。 */
  plugin?: PluginStateSnapshot;
  /** 失败时的错误信息。 */
  error?: string;
}
