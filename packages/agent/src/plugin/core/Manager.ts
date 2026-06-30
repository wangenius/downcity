/**
 * Plugin Manager 门面模块。
 */

export type {
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateSnapshot,
} from "@/plugin/types/Plugin.js";
export {
  controlPluginState,
  isPluginRunning,
  listPluginStates,
} from "@/plugin/core/PluginStateController.js";
export {
  runPluginCommand,
} from "@/plugin/core/PluginActionRunner.js";
