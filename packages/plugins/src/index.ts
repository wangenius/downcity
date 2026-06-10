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
export type {
  BuiltinPluginClass,
  BuiltinPluginOptions,
} from "./BuiltinPlugins.js";
export { ChatPlugin } from "./chat/ChatPlugin.js";
export { ContactPlugin } from "./contact/ContactPlugin.js";
export {
  FeishuChannel,
  QqChannel,
  TelegramChannel,
} from "./chat/channels/RuntimeChannel.js";
export { ImagePlugin } from "./image/ImagePlugin.js";
export { ChatChannelAccountManager } from "./chat/accounts/ChannelAccountManager.js";
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
  CHAT_AUTHORIZATION_ACTIONS,
  CHAT_AUTHORIZATION_CHANNELS,
  CHAT_AUTHORIZATION_POINTS,
  createDefaultChatAuthorizationRoles,
  isChatAuthorizationChannel,
} from "./auth/types/AuthPlugin.js";

export type {
  ChatChannelAccountListItem,
} from "./chat/types/ChannelAccount.js";
export type {
  BaseChatChannelOptions,
  ChatChannelEnv,
  FeishuChannelOptions,
  QqChannelOptions,
  TelegramChannelOptions,
} from "./chat/channels/RuntimeChannel.js";
export type {
  ChatChannel,
  ChatChannelRuntimePatch,
  ChatPluginOptions,
} from "./chat/types/ChatPluginOptions.js";
export type { ContactPluginOptions } from "./contact/types/ContactPluginOptions.js";
export type {
  AsrPluginInput,
  AsrPluginOptions,
  AsrPluginResult,
} from "./asr/types/AsrPlugin.js";
export type {
  TtsPluginInput,
  TtsPluginOptions,
  TtsPluginResult,
  TtsPluginSimpleAudioResult,
  TtsPluginUiMessageResult,
} from "./tts/types/TtsPlugin.js";
export type {
  ImagePluginContent,
  ImagePluginFileContent,
  ImagePluginInput,
  ImagePluginJobCreateResult,
  ImagePluginJobResult,
  ImagePluginJobStatus,
  ImagePluginMessage,
  ImagePluginOptions,
  ImagePluginResult,
  ImagePluginTextContent,
} from "./image/types/ImagePlugin.js";
export type {
  ChatAuthorizationCatalog,
  ChatAuthorizationChannel,
  ChatAuthorizationConfig,
  ChatAuthorizationDecision,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatAuthorizationObservePrincipalPayload,
  ChatAuthorizationObservedChat,
  ChatAuthorizationObservedUser,
  ChatAuthorizationPermission,
  ChatAuthorizationPermissionMeta,
  ChatAuthorizationResolveUserRolePayload,
  ChatAuthorizationRole,
  ChatAuthorizationSetUserRolePayload,
  ChatAuthorizationSnapshot,
  ChatAuthorizationStateFile,
  ChatAuthorizationWriteConfigPayload,
  ChatChannelAuthorizationConfig,
} from "./auth/types/AuthPlugin.js";
