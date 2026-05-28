/**
 * @downcity/plugins 公开入口。
 *
 * 关键点（中文）
 * - 这个包专门承载 Downcity 内建 plugin 的对外消费入口。
 * - 具体 built-in plugin class、静态目录、CLI 注册与本地 action 执行都在本包内实现。
 * - `@downcity/agent` 只提供 plugin 框架与 agent runtime 能力，本包通过宿主显式注入给 Agent。
 */

export {
  buildStaticPluginAvailability,
  findBuiltinPlugin,
  findStaticPluginView,
  listStaticPluginViews,
} from "./core/Catalog.js";
export {
  listBuiltinPluginAuthPolicies,
  registerBuiltinPluginHttpRoutes,
} from "./core/HttpRoutes.js";
export {
  registerAllPluginsForCli,
} from "./core/PluginCommand.js";
export { runLocalPluginAction } from "./core/LocalExecution.js";
export {
  createRegisteredPluginInstances,
  listLocalPlugins,
  listManagedPlugins,
  listRegisteredPlugins,
  listRegisteredPluginNames,
} from "./core/PluginClassRegistry.js";
export { ChatPlugin } from "./builtins/chat/ChatPlugin.js";
export { ChatChannelAccountManager } from "./builtins/chat/accounts/ChannelAccountManager.js";
export { AuthPlugin } from "./builtins/auth/Plugin.js";
export { SkillPlugin } from "./builtins/skill/Plugin.js";
export { WebPlugin } from "./builtins/web/Plugin.js";
export { AsrPlugin } from "./builtins/asr/Plugin.js";
export { TtsPlugin } from "./builtins/tts/Plugin.js";
export { WorkboardPlugin } from "./builtins/workboard/Plugin.js";
export {
  listChatAuthorizationRoles,
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
} from "./builtins/auth/runtime/AuthorizationConfig.js";
export { resolveAuthorizedUserRole } from "./builtins/auth/runtime/AuthorizationPolicy.js";
export {
  CHAT_AUTHORIZATION_CHANNELS,
  createDefaultChatAuthorizationRoles,
  isChatAuthorizationChannel,
} from "./builtins/auth/types/AuthPlugin.js";

export type {
  ChatChannelAccountListItem,
} from "./builtins/chat/types/ChannelAccount.js";
export type {
  ChatPluginFeishuOptions,
  ChatPluginOptions,
  ChatPluginQqOptions,
  ChatPluginTelegramOptions,
} from "./builtins/chat/ChatPluginTypes.js";
export type {
  AuthObservePrincipalPayload,
  AuthObservePrincipalResult,
  AuthResolveUserRolePayload,
  AuthSetUserRolePayload,
  AuthWriteConfigPayload,
  ChatAuthorizationCatalog,
  ChatAuthorizationChannel,
  ChatAuthorizationConfig,
  ChatAuthorizationDecision,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatAuthorizationObservedChat,
  ChatAuthorizationObservedUser,
  ChatAuthorizationPermission,
  ChatAuthorizationPermissionMeta,
  ChatAuthorizationRole,
  ChatAuthorizationSnapshot,
  ChatAuthorizationStateFile,
  ChatChannelAuthorizationConfig,
} from "./builtins/auth/types/AuthPlugin.js";
