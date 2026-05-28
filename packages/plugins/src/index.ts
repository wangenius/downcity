/**
 * @downcity/plugins 公开入口。
 *
 * 关键点（中文）
 * - 这个包专门承载 Downcity 内建 plugin 的对外消费入口。
 * - 本包只导出具体 plugin class 与默认内建集合工厂。
 * - 注册、目录、HTTP、CLI、action 执行都由 `@downcity/agent` 的通用能力处理。
 */

export {
  BUILTIN_PLUGIN_CLASSES,
  createBuiltinPlugins,
} from "./BuiltinPlugins.js";
export type { BuiltinPluginClass } from "./BuiltinPlugins.js";
export { ChatPlugin } from "./chat/ChatPlugin.js";
export { ChatChannelAccountManager } from "./chat/accounts/ChannelAccountManager.js";
export { AuthPlugin } from "./auth/Plugin.js";
export { SkillPlugin } from "./skill/Plugin.js";
export { WebPlugin } from "./web/Plugin.js";
export { AsrPlugin } from "./asr/Plugin.js";
export { TtsPlugin } from "./tts/Plugin.js";
export { WorkboardPlugin } from "./workboard/Plugin.js";
export {
  listChatAuthorizationRoles,
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
} from "./auth/runtime/AuthorizationConfig.js";
export { resolveAuthorizedUserRole } from "./auth/runtime/AuthorizationPolicy.js";
export {
  CHAT_AUTHORIZATION_CHANNELS,
  createDefaultChatAuthorizationRoles,
  isChatAuthorizationChannel,
} from "./auth/types/AuthPlugin.js";

export type {
  ChatChannelAccountListItem,
} from "./chat/types/ChannelAccount.js";
export type {
  ChatPluginFeishuOptions,
  ChatPluginOptions,
  ChatPluginQqOptions,
  ChatPluginTelegramOptions,
} from "./chat/ChatPluginTypes.js";
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
} from "./auth/types/AuthPlugin.js";
