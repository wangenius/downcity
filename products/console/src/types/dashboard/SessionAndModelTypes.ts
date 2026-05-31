/**
 * Console Dashboard 日志、Prompt、Session、模型与账号类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

/**
 * 日志项。
 */
export interface UiLogItem {
  /**
   * 日志时间戳（number 或 string）。
   */
  timestamp?: number | string;
  /**
   * 日志类型（兼容字段）。
   */
  type?: string;
  /**
   * 日志级别（兼容字段）。
   */
  level?: string;
  /**
   * 日志消息。
   */
  message?: string;
}

/**
 * `/api/dashboard/logs` 响应。
 */
export interface UiLogsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 日志列表。
   */
  logs?: UiLogItem[];
}

/**
 * Prompt section item。
 */
export interface UiPromptSectionItem {
  /**
   * 消息索引。
   */
  index?: number;
  /**
   * 消息内容。
   */
  content?: string;
}

/**
 * Prompt section。
 */
export interface UiPromptSection {
  /**
   * section 标题。
   */
  title?: string;
  /**
   * section key。
   */
  key?: string;
  /**
   * section 下的消息项。
   */
  items?: UiPromptSectionItem[];
}

/**
 * `/api/dashboard/system-prompt` 响应。
 */
export interface UiPromptResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 session id。
   */
  sessionId?: string;
  /**
   * 消息总数。
   */
  totalMessages?: number;
  /**
   * 字符总数。
   */
  totalChars?: number;
  /**
   * 分段列表。
   */
  sections?: UiPromptSection[];
}

/**
 * session 时间线消息项（来自 `/api/dashboard/sessions/:id/messages`）。
 */
export interface UiSessionTimelineMessage {
  /**
   * 消息 id。
   */
  id?: string;
  /**
   * 消息角色。
   */
  role?: string;
  /**
   * 消息时间戳。
   */
  ts?: number | string;
  /**
   * 消息文本。
   */
  text?: string;
  /**
   * 消息类型。
   */
  kind?: string;
  /**
   * 消息来源。
   */
  source?: string;
  /**
   * tool 名称。
   */
  toolName?: string;
}

/**
 * local_ui 消息项。
 *
 * 关键点（中文）
 * - local_ui 实际复用 session timeline 接口。
 * - 直接复用完整时间线结构，避免 toolName 等字段在前端被截断。
 */
export type UiLocalMessage = UiSessionTimelineMessage;

/**
 * `/api/dashboard/sessions/:id/messages` 响应。
 */
export interface UiSessionMessagesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * session id。
   */
  sessionId?: string;
  /**
   * 时间线消息列表。
   */
  messages?: UiSessionTimelineMessage[];
}

/**
 * session compact archive 摘要项。
 */
export interface UiSessionArchiveSummary {
  /**
   * archive 唯一标识（文件名去掉 `.json` 后解码）。
   */
  archiveId?: string;
  /**
   * archive 归档时间戳（毫秒）。
   */
  archivedAt?: number;
  /**
   * archive 中原始消息数量。
   */
  messageCount?: number;
  /**
   * archive 文件相对路径（便于调试展示）。
   */
  path?: string;
}

/**
 * `/api/dashboard/sessions/:id/archives` 响应。
 */
export interface UiSessionArchivesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * session id。
   */
  sessionId?: string;
  /**
   * archive 列表。
   */
  archives?: UiSessionArchiveSummary[];
}

/**
 * `/api/dashboard/sessions/:id/archives/:archiveId` 响应。
 */
export interface UiSessionArchiveDetailResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * session id。
   */
  sessionId?: string;
  /**
   * archive id。
   */
  archiveId?: string;
  /**
   * archive 归档时间戳（毫秒）。
   */
  archivedAt?: number;
  /**
   * 转换后的时间线消息总数。
   */
  total?: number;
  /**
   * archive 原始消息总数（写入前的 ContextMessage 条数）。
   */
  rawTotal?: number;
  /**
   * archive 中可展示的时间线消息列表。
   */
  messages?: UiSessionTimelineMessage[];
}

/**
 * 通用“清理成功”响应。
 */
export interface UiSessionClearResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * session id。
   */
  sessionId?: string;
  /**
   * 是否完成清理。
   */
  cleared?: boolean;
}

/**
 * chat.delete 返回数据。
 */
export interface UiChatDeleteResult {
  /**
   * 被删除的 session id。
   */
  sessionId?: string | null;
  /**
   * 兼容字段：被删除的 context id。
   */
  contextId?: string | null;
  /**
   * 是否真正删除了上下文目录。
   */
  deleted?: boolean;
  /**
   * 是否删除了 channel meta 映射。
   */
  removedMeta?: boolean;
  /**
   * 是否删除了 chat 审计目录。
   */
  removedChatDir?: boolean;
  /**
   * 是否删除了 session 目录。
   */
  removedSessionDir?: boolean;
  /**
   * 兼容字段：是否删除了 context 目录。
   */
  removedContextDir?: boolean;
}

/**
 * `/api/services/command` chat.delete 响应。
 */
export interface UiChatDeleteResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * chat.delete 返回数据。
   */
  data?: UiChatDeleteResult;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}

/**
 * chat history 事件项（来自 chat.history）。
 */
export interface UiChatHistoryEvent {
  /**
   * 事件 id。
   */
  id?: string;
  /**
   * 事件方向。
   */
  direction?: "inbound" | "outbound" | string;
  /**
   * 事件时间戳。
   */
  ts?: number;
  /**
   * 渠道名。
   */
  channel?: string;
  /**
   * 文本内容。
   */
  text?: string;
  /**
   * session id。
   */
  sessionId?: string;
  /**
   * 兼容字段：context id。
   */
  contextId?: string;
  /**
   * 便于展示的 ISO 时间。
   */
  isoTime?: string;
  /**
   * 外部用户展示名（如果渠道提供）。
   */
  username?: string;
  /**
   * chat history 标准入站用户名（后端字段）。
   */
  actorName?: string;
  /**
   * 附加信息（可能包含 username）。
   */
  extra?: Record<string, unknown>;
}

/**
 * `/api/dashboard/contexts/:id/messages` 响应。
 */
export interface UiLocalMessagesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 消息列表。
   */
  messages?: UiLocalMessage[];
}

/**
 * 模型选项项（来自 `/api/ui/model`）。
 */
export interface UiModelOption {
  /**
   * 模型配置 id（对应 llm.models 的 key）。
   */
  id?: string;
  /**
   * 上游模型名称。
   */
  name?: string;
  /**
   * provider key。
   */
  providerKey?: string;
  /**
   * provider 类型。
   */
  providerType?: string;
  /**
   * 是否处于暂停状态。
   */
  isPaused?: boolean;
}

/**
 * 当前激活模型信息。
 */
export interface UiModelSummary {
  /**
   * 当前 agent 绑定模型 id（execution.modelId）。
   */
  primaryModelId?: string;
  /**
   * 当前 agent 的 execution.modelId 绑定。
   */
  agentPrimaryModelId?: string;
  /**
   * 激活模型名称。
   */
  primaryModelName?: string;
  /**
   * 激活模型 provider key。
   */
  providerKey?: string;
  /**
   * 激活模型 provider 类型。
   */
  providerType?: string;
  /**
   * provider baseUrl。
   */
  baseUrl?: string;
  /**
   * 可切换模型列表。
   */
  availableModels?: UiModelOption[];
}

/**
 * `/api/ui/model` 响应。
 */
export interface UiModelResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 模型信息。
   */
  model?: UiModelSummary;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}

/**
 * Provider 管理项（来自 `/api/ui/model/pool`）。
 */
export interface UiModelProviderItem {
  /**
   * provider id。
   */
  id: string;
  /**
   * provider 类型。
   */
  type: string;
  /**
   * provider baseUrl。
   */
  baseUrl?: string;
  /**
   * 是否已配置 apiKey。
   */
  hasApiKey?: boolean;
  /**
   * 脱敏后的 apiKey。
   */
  apiKeyMasked?: string;
  /**
   * 创建时间。
   */
  createdAt?: string;
  /**
   * 更新时间。
   */
  updatedAt?: string;
}

/**
 * Model 管理项（来自 `/api/ui/model/pool`）。
 */
export interface UiModelPoolItem {
  /**
   * model id。
   */
  id: string;
  /**
   * provider id。
   */
  providerId: string;
  /**
   * 上游模型名。
   */
  name: string;
  /**
   * 采样温度。
   */
  temperature?: number;
  /**
   * 最大 token。
   */
  maxTokens?: number;
  /**
   * top-p。
   */
  topP?: number;
  /**
   * 频率惩罚。
   */
  frequencyPenalty?: number;
  /**
   * 存在惩罚。
   */
  presencePenalty?: number;
  /**
   * anthropicVersion。
   */
  anthropicVersion?: string;
  /**
   * 是否暂停。
   */
  isPaused?: boolean;
  /**
   * 创建时间。
   */
  createdAt?: string;
  /**
   * 更新时间。
   */
  updatedAt?: string;
}

/**
 * `/api/ui/model/pool` 响应。
 */
export interface UiModelPoolResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * provider 列表。
   */
  providers?: UiModelProviderItem[];
  /**
   * model 列表。
   */
  models?: UiModelPoolItem[];
  /**
   * provider id 列表。
   */
  providerIds?: string[];
  /**
   * model id 列表。
   */
  modelIds?: string[];
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * Provider discover 结果（来自 `/api/ui/model/provider/discover`）。
 */
export interface UiModelProviderDiscoverResult {
  /**
   * 发起 discover 的 provider id。
   */
  providerId: string;
  /**
   * 发现到的上游模型名称列表。
   */
  discoveredModels: string[];
  /**
   * 发现总数。
   */
  modelCount: number;
  /**
   * 自动写入模型池的条目（仅 `autoAdd=true` 时存在）。
   */
  autoAdded: Array<{
    /**
     * 写入模型池后的模型 id。
     */
    modelId: string;
    /**
     * 对应的上游模型名称。
     */
    modelName: string;
  }>;
}

/**
 * Channel Account 管理项（来自 `/api/ui/channel-accounts`）。
 */
export interface UiChannelAccountItem {
  /**
   * 账户主键 id。
   */
  id: string;
  /**
   * 渠道类型（telegram/feishu/qq）。
   */
  channel: string;
  /**
   * 账户展示名。
   */
  name: string;
  /**
   * 身份展示文案。
   */
  identity?: string;
  /**
   * 机器人所有者信息（可选）。
   */
  owner?: string;
  /**
   * 机器人创建者信息（可选）。
   */
  creator?: string;
  /**
   * 渠道域名（主要用于 Feishu）。
   */
  domain?: string;
  /**
   * QQ 沙箱开关。
   */
  sandbox?: boolean;
  /**
   * 是否已配置 botToken。
   */
  hasBotToken?: boolean;
  /**
   * 是否已配置 appId。
   */
  hasAppId?: boolean;
  /**
   * 是否已配置 appSecret。
   */
  hasAppSecret?: boolean;
  /**
   * 脱敏 botToken。
   */
  botTokenMasked?: string;
  /**
   * 脱敏 appId。
   */
  appIdMasked?: string;
  /**
   * 脱敏 appSecret。
   */
  appSecretMasked?: string;
  /**
   * 创建时间。
   */
  createdAt?: string;
  /**
   * 更新时间。
   */
  updatedAt?: string;
}

/**
 * `/api/ui/channel-accounts` 响应。
 */
export interface UiChannelAccountsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 账户列表。
   */
  items?: UiChannelAccountItem[];
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * Channel Account 探测结果（来自 `/api/ui/channel-accounts/probe`）。
 */
export interface UiChannelAccountProbeResult {
  /**
   * 渠道类型。
   */
  channel: string;
  /**
   * 系统建议的 account id（自动生成）。
   */
  accountId: string;
  /**
   * 探测得到的 bot 名称。
   */
  name: string;
  /**
   * 探测得到的身份标识（可选）。
   */
  identity?: string;
  /**
   * 探测得到的所有者信息（可选）。
   */
  owner?: string;
  /**
   * 探测得到的创建者信息（可选）。
   */
  creator?: string;
  /**
   * 探测得到的 bot user id（可选）。
   */
  botUserId?: string;
  /**
   * 探测反馈文案。
   */
  message?: string;
}
