/**
 * Agent 宿主能力类型定义。
 *
 * 关键点（中文）
 * - 这里统一描述由 main 装配、再挂入 AgentRuntime 的宿主能力。
 * - services / sessions / plugins 只能消费这些稳定能力，不应直接依赖 `main/*` 实现。
 * - 当前先收敛路径、认证、plugin 配置持久化三类高频能力。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type {
  ChatAuthorizationChannel,
  ChatAuthorizationConfig,
} from "@/shared/types/AuthPlugin.js";
import type {
  ChatChannelAccountCreateInput,
  ChatChannelAccountListItem,
  ChatChannelAccountProbeResult,
  ChatChannelAccountUpsertInput,
} from "@/service/builtins/chat/types/ChannelAccount.js";
import type {
  StoredChannelAccount,
  StoredModel,
  StoredModelProvider,
} from "@/shared/types/Store.js";
import type { ChatChannelName } from "@/service/builtins/chat/types/ChannelStatus.js";
import type { AgentProjectInitializationInput } from "@/shared/types/AgentProject.js";
import type { PlatformModelChoice } from "@/agent/project/AgentInitializer.js";

/**
 * Agent 路径能力集合。
 */
export interface AgentPathRuntime {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;
  /**
   * `.downcity` 根目录路径。
   */
  getDowncityDirPath(): string;
  /**
   * `.downcity/.cache` 目录路径。
   */
  getCacheDirPath(): string;
  /**
   * `.downcity/channel` 目录路径。
   */
  getDowncityChannelDirPath(): string;
  /**
   * `.downcity/channel/meta.json` 文件路径。
   */
  getDowncityChannelMetaPath(): string;
  /**
   * `.downcity/chat/<sessionId>/history.jsonl` 文件路径。
   */
  getDowncityChatHistoryPath(sessionId: string): string;
  /**
   * `.downcity/memory/MEMORY.md` 文件路径。
   */
  getDowncityMemoryLongTermPath(): string;
  /**
   * `.downcity/memory/daily` 目录路径。
   */
  getDowncityMemoryDailyDirPath(): string;
  /**
   * `.downcity/memory/daily/<date>.md` 文件路径。
   */
  getDowncityMemoryDailyPath(date: string): string;
  /**
   * `.downcity/session` 根目录路径。
   */
  getDowncitySessionRootDirPath(): string;
  /**
   * `.downcity/session/<sessionId>` 目录路径。
   */
  getDowncitySessionDirPath(sessionId: string): string;
}

/**
 * Plugin 配置持久化能力集合。
 */
export interface AgentPluginConfigRuntime {
  /**
   * 将当前 `plugins` 配置块写回项目 `downcity.json`。
   */
  persistProjectPlugins(plugins: DowncityConfig["plugins"] | undefined): Promise<string>;
}

/**
 * Agent 可见的平台能力集合。
 *
 * 关键点（中文）
 * - agent 只消费这些平台能力，不直接管理平台级持久化实现。
 * - 具体数据存储与管理应由 city / control plane 提供。
 */
export interface AgentPlatformRuntime {
  /**
   * 读取当前平台级全局环境变量快照。
   */
  getGlobalEnv(): Record<string, string>;
  /**
   * 读取指定 agent 项目的私有环境变量快照。
   */
  getAgentEnv(projectRoot: string): Record<string, string>;
  /**
   * 读取当前平台模型池中的全部模型。
   */
  listModels(): StoredModel[];
  /**
   * 读取当前平台模型池中的全部 provider。
   */
  listProviders(): Promise<StoredModelProvider[]>;
  /**
   * 按模型 ID 读取单个模型。
   */
  getModel(modelId: string): StoredModel | null;
  /**
   * 按账户 ID 读取单个渠道账户。
   */
  getChannelAccount(channelAccountId: string): StoredChannelAccount | null;
  /**
   * 列出当前平台保存的全部渠道账户安全视图。
   */
  listChannelAccounts?(): Promise<ChatChannelAccountListItem[]>;
  /**
   * 探测渠道凭据并返回建议账户信息。
   */
  probeChannelAccount?(input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  }): Promise<ChatChannelAccountProbeResult>;
  /**
   * 创建新的渠道账户。
   */
  createChannelAccount?(input: ChatChannelAccountCreateInput): Promise<{
    id: string;
    probed: boolean;
    message?: string;
  }>;
  /**
   * 更新现有渠道账户。
   */
  updateChannelAccount?(input: ChatChannelAccountUpsertInput): Promise<void>;
  /**
   * 删除渠道账户。
   */
  removeChannelAccount?(channelAccountId: string): Promise<void>;
  /**
   * 解析某个渠道当前应使用的账户。
   */
  resolveChannelAccount?(params: {
    projectRoot: string;
    channel: ChatChannelName;
    channelAccountId?: string;
  }): StoredChannelAccount | null;
  /**
   * 读取当前 agent 的 chat 授权配置。
   */
  readChatAuthorizationConfig(projectRoot: string): ChatAuthorizationConfig;
  /**
   * 覆盖写入当前 agent 的 chat 授权配置。
   */
  writeChatAuthorizationConfig(
    projectRoot: string,
    nextConfig: ChatAuthorizationConfig,
  ): Promise<ChatAuthorizationConfig>;
  /**
   * 设置当前 agent 某个渠道用户的授权角色。
   */
  setChatAuthorizationUserRole(params: {
    projectRoot: string;
    channel: ChatAuthorizationChannel;
    userId: string;
    roleId: string;
  }): Promise<ChatAuthorizationConfig>;
  /**
   * 判断指定 plugin 当前是否启用。
   */
  isPluginEnabled(pluginName: string): boolean;
  /**
   * 设置指定 plugin 的全局启用态。
   */
  setPluginEnabled?(pluginName: string, enabled: boolean): void;
  /**
   * 列出平台模型选项。
   */
  listPlatformModelChoices?(): Promise<PlatformModelChoice[]>;
  /**
   * 初始化 agent 项目。
   */
  initializeAgentProject?(
    input: AgentProjectInitializationInput,
  ): Promise<{
    projectRoot: string;
    agentName: string;
    createdFiles: string[];
    skippedFiles: string[];
  }>;
  /**
   * 校验项目执行绑定是否已就绪。
   */
  ensureRuntimeExecutionBindingReady?(projectRoot: string): void;
}
