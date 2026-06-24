/**
 * Plugin 类型 facade。
 *
 * 关键点（中文）
 * - 保留旧的 `@/plugin/types/Plugin.js` 导入路径。
 * - 真实类型按职责拆到 `src/types/plugin/*`，避免单文件继续膨胀。
 */

export type {
  PluginState,
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateRecord,
  PluginStateSnapshot,
} from "@/types/plugin/PluginState.js";
export type {
  PluginCommandContext,
  PluginCommandParams,
  PluginCommandResult,
  PluginLifecycle,
} from "@/types/plugin/PluginCommand.js";
export type {
  PluginAction,
  PluginActionApi,
  PluginActionCommand,
  PluginActionCommandInput,
  PluginActionExample,
  PluginActionInvokeParams,
  PluginActionInvokePort,
  PluginActionInvokeResult,
  PluginActionInputSchema,
  PluginActionMetadata,
  PluginActionResult,
  PluginActions,
} from "@/types/plugin/PluginAction.js";
export type {
  PluginAvailability,
  PluginConfigDefinition,
  PluginEffectHook,
  PluginGuardHook,
  PluginHooks,
  PluginPipelineHook,
  AgentPlugins,
  PluginActionReadView,
  PluginResolveHook,
  PluginResolves,
  PluginReadView,
  PluginView,
} from "@/types/plugin/PluginRuntime.js";
export type {
  PluginSetupDefinition,
  PluginSetupField,
  PluginSetupFieldOption,
  PluginUsageDefinition,
  PluginUsageField,
  PluginUsageFieldOption,
} from "@/types/plugin/PluginSetup.js";
export type {
  PluginHttpDefinition,
  PluginHttpRegistration,
} from "@/types/plugin/PluginHttp.js";
export type { Plugin } from "@/types/plugin/PluginDefinition.js";
