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
export { SoundPlugin } from "./sound/Plugin.js";
export { WorkboardPlugin } from "./workboard/Plugin.js";
export { TaskPlugin } from "./task/TaskPlugin.js";
export { MemoryPlugin } from "./memory/MemoryPlugin.js";
export {
  ChatAccessService,
  is_chat_access_channel,
  resolve_chat_access_scope,
  resolve_chat_access_scopes,
} from "./chat/access/ChatAccessService.js";
export { get_chat_access_db_path } from "./chat/access/ChatAccessStore.js";
export { CHAT_ACCESS_ACTIONS } from "./chat/types/ChatAccess.js";

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
export type { TaskPluginOptions } from "./task/types/TaskPluginOptions.js";
export type {
  MemoryActionPayload,
  MemoryDefaults,
  MemoryDigestHandler,
  MemoryDigestHandlerInput,
  MemoryDigestHandlerOutput,
  MemoryDigestPayload,
  MemoryDigestResponse,
  MemoryPluginOptions,
  MemoryReadPayload,
  MemoryReadResponse,
  MemoryRememberPayload,
  MemoryRememberResponse,
  MemoryReviseHandler,
  MemoryReviseHandlerInput,
  MemoryReviseHandlerOutput,
  MemoryRevisePayload,
  MemoryReviseResponse,
  MemorySearchMode,
  MemorySearchPayload,
  MemorySearchResponse,
  MemorySearchResultItem,
  MemorySourceStat,
  MemorySourceType,
  MemoryStatusResponse,
  MemoryWikiPageDraft,
} from "./memory/types/Memory.js";
export type {
  SoundPluginAsrInput,
  SoundPluginAsrResult,
  SoundPluginAsrSegment,
  SoundPluginCapability,
  SoundPluginModel,
  SoundPluginModelsResult,
  SoundPluginOptions,
  SoundPluginTtsInput,
  SoundPluginTtsResult,
} from "./sound/types/SoundPlugin.js";
export type {
  ImagePluginContent,
  ImagePluginDefaultModel,
  ImagePluginDefaultModelResolverInput,
  ImagePluginFileContent,
  ImagePluginInput,
  ImagePluginJobCreateResult,
  ImagePluginJobResult,
  ImagePluginJobResultInput,
  ImagePluginJobStatus,
  ImagePluginModel,
  ImagePluginModelsResult,
  ImagePluginOptions,
  ImagePluginResolvedContent,
  ImagePluginResolvedInput,
  ImagePluginResolvedMessage,
  ImagePluginResult,
  ImagePluginTextContent,
} from "./image/types/ImagePlugin.js";
export type {
  ApproveChatAccessRequestInput,
  ChatAccessDecision,
  ChatAccessDecisionReason,
  ChatAccessEffect,
  ChatAccessGrant,
  ChatAccessIdentityInput,
  ChatAccessPrincipal,
  ChatAccessPrincipalView,
  ChatAccessRequest,
  ChatAccessRequestStatus,
  ChatAccessRequestView,
  ChatAccessScope,
  ChatAccessScopeInput,
  ChatAccessServiceOptions,
  ChatAccessSnapshot,
  DenyChatAccessRequestInput,
  ListChatAccessRequestsInput,
  RevokeChatAccessGrantInput,
  SetChatAccessPrincipalEffectInput,
} from "./chat/types/ChatAccess.js";
