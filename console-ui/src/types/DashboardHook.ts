/**
 * Console Dashboard Hook 类型定义。
 *
 * 关键点（中文）
 * - 承载 `useConsoleDashboard` 对外暴露的结果类型。
 * - 与通用 dashboard 响应类型分离，避免单个类型文件继续膨胀。
 */

import type {
  UiAgentCreatePayload,
  UiAgentDirectoryInspection,
  UiAgentInitializationInput,
  UiAgentOption,
  UiChannelAccountItem,
  UiChannelAccountProbeResult,
  UiChatAuthorizationResponse,
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiConfigStatusItem,
  UiEnvItem,
  UiLocalMessage,
  UiLogItem,
  UiModelPoolItem,
  UiModelProviderDiscoverResult,
  UiModelProviderItem,
  UiModelSummary,
  UiOverviewResponse,
  UiPluginActionExecutionResult,
  UiPluginRuntimeItem,
  UiPromptResponse,
  UiServiceItem,
  UiSessionArchiveSummary,
  UiSessionSummary,
  UiSessionTimelineMessage,
  UiSkillFindResult,
  UiSkillInstallPayload,
  UiSkillInstallResult,
  UiSkillLookupResult,
  UiSkillSummaryItem,
  UiTaskItem,
  UiTaskRunDetailResponse,
  UiTaskRunSummary,
  UiTaskStatusValue,
  UiCommandExecuteResult,
} from "./Dashboard";
import type {
  UiAuthAdminIssuedToken,
  UiAuthAdminRoleCatalogItem,
  UiAuthAdminTokenSummary,
  UiAuthAdminUserSummary,
} from "./AuthAdmin";

/**
 * toast 类型。
 */
export type DashboardToastType = "info" | "success" | "error";

/**
 * toast 状态。
 */
export interface DashboardToastState {
  /**
   * 提示文案。
   */
  message: string;

  /**
   * 提示类型。
   */
  type: DashboardToastType;
}

/**
 * `useConsoleDashboard` 返回值。
 */
export interface UseConsoleDashboardResult {
  /**
   * 当前是否仍在执行首屏鉴权探测。
   */
  authInitializing: boolean;

  /**
   * 当前是否需要先初始化首个管理员。
   */
  authBootstrapRequired: boolean;

  /**
   * 当前是否已持有有效 Bearer Token。
   */
  isAuthenticated: boolean;

  /**
   * 当前登录用户名。
   */
  authUsername: string;

  /**
   * 当前是否需要登录。
   */
  authRequired: boolean;

  /**
   * 当前是否正在登录。
   */
  authSubmitting: boolean;

  /**
   * 当前登录错误文案。
   */
  authErrorMessage: string;

  /**
   * 当前 agent 列表。
   */
  agents: UiAgentOption[];

  /**
   * 当前 DC CLI 版本号（来自 console 网关）。
   */
  cityVersion: string;

  /**
   * 当前选中的 agent id。
   */
  selectedAgentId: string;

  /**
   * 当前选中 agent 对象。
   */
  selectedAgent: UiAgentOption | null;

  /**
   * dashboard 概览数据。
   */
  overview: UiOverviewResponse | null;

  /**
   * 当前 agent 的授权快照。
   */
  authorization: UiChatAuthorizationResponse | null;

  /**
   * 统一账户角色目录。
   */
  accessRoles: UiAuthAdminRoleCatalogItem[];

  /**
   * 统一账户用户列表。
   */
  accessUsers: UiAuthAdminUserSummary[];

  /**
   * 当前选中的统一账户用户 ID。
   */
  selectedAccessUserId: string;

  /**
   * 当前选中的统一账户用户。
   */
  selectedAccessUser: UiAuthAdminUserSummary | null;

  /**
   * 当前选中用户的 token 列表。
   */
  accessTokens: UiAuthAdminTokenSummary[];

  /**
   * 当前是否正在加载统一账户用户目录。
   */
  accessLoading: boolean;

  /**
   * 当前是否正在加载选中用户的 token 列表。
   */
  accessTokensLoading: boolean;

  /**
   * 最近一次新签发的明文 token。
   */
  latestIssuedAccessToken: UiAuthAdminIssuedToken | null;

  /**
   * service 状态列表。
   */
  services: UiServiceItem[];

  /**
   * skills 列表。
   */
  skills: UiSkillSummaryItem[];

  /**
   * plugin 状态列表。
   */
  plugins: UiPluginRuntimeItem[];

  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[];

  /**
   * session 摘要列表。
   */
  sessions: UiSessionSummary[];

  /**
   * 当前选中的 sessionId。
   */
  selectedSessionId: string;

  /**
   * chat history 事件列表。
   */
  channelHistory: UiChatHistoryEvent[];

  /**
   * session 时间线消息列表。
   */
  sessionMessages: UiSessionTimelineMessage[];

  /**
   * compact archive 列表。
   */
  sessionArchives: UiSessionArchiveSummary[];

  /**
   * 当前选中的 archive id。
   */
  selectedArchiveId: string;

  /**
   * 当前选中 archive 的消息时间线。
   */
  sessionArchiveMessages: UiSessionTimelineMessage[];

  /**
   * 任务状态列表。
   */
  tasks: UiTaskItem[];

  /**
   * 近期日志列表。
   */
  logs: UiLogItem[];

  /**
   * 模型配置快照。
   */
  model: UiModelSummary | null;

  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[];

  /**
   * 模型池 provider 列表。
   */
  modelProviders: UiModelProviderItem[];

  /**
   * 模型池 model 列表。
   */
  modelPoolItems: UiModelPoolItem[];

  /**
   * Channel Account 列表（全局）。
   */
  channelAccounts: UiChannelAccountItem[];

  /**
   * Console 全局 env 列表。
   */
  globalEnvItems: UiEnvItem[];

  /**
   * 当前选中 agent 的私有 env 列表。
   */
  agentEnvItems: UiEnvItem[];

  /**
   * system prompt 数据。
   */
  prompt: UiPromptResponse | null;

  /**
   * consoleui channel 消息列表。
   */
  localMessages: UiLocalMessage[];

  /**
   * 顶栏状态文本。
   */
  topbarStatus: string;

  /**
   * 顶栏是否错误状态。
   */
  topbarError: boolean;

  /**
   * 是否正在刷新。
   */
  loading: boolean;

  /**
   * 是否正在发送 consoleui channel 消息。
   */
  sending: boolean;

  /**
   * 是否正在清理 session messages。
   */
  clearingSessionMessages: boolean;

  /**
   * 是否正在清理 chat history。
   */
  clearingChatHistory: boolean;

  /**
   * 正在删除的 session id。
   */
  deletingSessionId: string;

  /**
   * consoleui channel 输入框内容。
   */
  chatInput: string;

  /**
   * toast 状态。
   */
  toast: DashboardToastState | null;

  /**
   * 更新输入框内容。
   */
  setChatInput: (value: string) => void;

  /**
   * 手动切换 agent。
   */
  handleAgentChange: (nextAgentId: string) => void;

  /**
   * 切换当前 session。
   */
  handleSessionChange: (sessionId: string) => Promise<void>;

  /**
   * 手动刷新 dashboard。
   */
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;

  /**
   * 刷新授权快照。
   */
  refreshAuthorization: (agentId: string) => Promise<void>;

  /**
   * 刷新统一账户用户目录。
   */
  refreshAccessUsers: (preferredUserId?: string) => Promise<void>;

  /**
   * 刷新 chat 渠道状态。
   */
  refreshChatChannels: (agentId: string) => Promise<UiChatChannelStatus[]>;

  /**
   * 刷新 plugin 状态。
   */
  refreshPlugins: (agentId: string) => Promise<UiPluginRuntimeItem[] | void>;

  /**
   * 刷新 skills 列表。
   */
  refreshSkills: (agentId: string) => Promise<void>;

  /**
   * 刷新 session 列表。
   */
  refreshSessions: (agentId: string) => Promise<UiSessionSummary[]>;

  /**
   * 刷新 chat history。
   */
  refreshChannelHistory: (agentId: string, sessionId: string) => Promise<void>;

  /**
   * 刷新 session message 历史。
   */
  refreshSessionMessages: (agentId: string, sessionId: string) => Promise<void>;

  /**
   * 刷新 compact archive 列表。
   */
  refreshSessionArchives: (agentId: string, sessionId: string) => Promise<UiSessionArchiveSummary[]>;

  /**
   * 加载 archive 详情。
   */
  loadSessionArchiveMessages: (
    agentId: string,
    sessionId: string,
    archiveId: string,
  ) => Promise<void>;

  /**
   * 刷新 prompt。
   */
  refreshPrompt: (agentId: string, sessionId?: string) => Promise<void>;

  /**
   * 刷新模型信息。
   */
  refreshModel: (agentId: string) => Promise<void>;

  /**
   * 刷新模型池数据。
   */
  refreshModelPool: () => Promise<void>;

  /**
   * 刷新 Console 全局 env。
   */
  refreshGlobalEnv: () => Promise<void>;

  /**
   * 刷新当前 agent 私有 env。
   */
  refreshAgentEnv: (agentId: string) => Promise<void>;

  /**
   * 刷新配置文件状态。
   */
  refreshConfigStatus: (agentId: string) => Promise<void>;

  /**
   * 刷新 consoleui channel 消息。
   */
  refreshLocalChat: (agentId: string) => Promise<void>;

  /**
   * 保存授权配置。
   */
  saveAuthorizationConfig: (
    config: NonNullable<UiChatAuthorizationResponse["config"]>,
  ) => Promise<void>;

  /**
   * 执行授权动作。
   */
  runAuthorizationAction: (input: {
    action: "setUserRole";
    channel: string;
    userId?: string;
    roleId?: string;
  }) => Promise<void>;

  /**
   * 清空最近一次新签发的明文 token。
   */
  clearLatestIssuedAccessToken: () => void;

  /**
   * 切换当前选中的统一账户用户。
   */
  selectAccessUser: (userId: string) => Promise<void>;

  /**
   * 创建统一账户用户。
   */
  createAccessUser: (input: {
    username: string;
    password: string;
    displayName?: string;
    roleName: string;
  }) => Promise<void>;

  /**
   * 更新统一账户用户状态或展示名。
   */
  updateAccessUser: (input: {
    userId: string;
    displayName?: string;
    status: "active" | "disabled";
  }) => Promise<void>;

  /**
   * 更新统一账户用户角色。
   */
  setAccessUserRole: (input: {
    userId: string;
    roleName: string;
  }) => Promise<void>;

  /**
   * 为统一账户用户签发 token。
   */
  createAccessUserToken: (input: {
    userId: string;
    name: string;
    expiresAt?: string;
  }) => Promise<void>;

  /**
   * 吊销统一账户用户 token。
   */
  revokeAccessUserToken: (input: {
    userId: string;
    tokenId: string;
  }) => Promise<void>;

  /**
   * 控制 service。
   */
  controlService: (serviceName: string, action: string) => Promise<void>;

  /**
   * 运行 plugin action。
   */
  runPluginAction: (
    pluginName: string,
    actionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<UiPluginActionExecutionResult>;

  /**
   * 执行 chat 渠道动作。
   */
  runChatChannelAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => Promise<void>;

  /**
   * 更新 chat 渠道配置参数。
   */
  configureChatChannel: (channel: string, config: Record<string, unknown>) => Promise<void>;

  /**
   * 查找缺失 skill。
   */
  runSkillFind: (query: string) => Promise<UiSkillFindResult | null>;

  /**
   * 安装 skill。
   */
  runSkillInstall: (input: UiSkillInstallPayload) => Promise<UiSkillInstallResult | null>;

  /**
   * 读取 skill 内容。
   */
  runSkillLookup: (name: string) => Promise<UiSkillLookupResult | null>;

  /**
   * 触发 task 运行。
   */
  runTask: (title: string) => Promise<void>;

  /**
   * 更新任务状态。
   */
  setTaskStatus: (title: string, status: UiTaskStatusValue) => Promise<boolean>;

  /**
   * 删除任务定义。
   */
  deleteTask: (title: string) => Promise<boolean>;

  /**
   * 加载任务执行列表。
   */
  loadTaskRuns: (title: string, limit?: number) => Promise<UiTaskRunSummary[]>;

  /**
   * 删除单条 run 记录目录。
   */
  deleteTaskRun: (title: string, timestamp: string) => Promise<boolean>;

  /**
   * 清理指定任务的全部 run 记录。
   */
  clearTaskRuns: (title: string) => Promise<boolean>;

  /**
   * 加载任务执行详情。
   */
  loadTaskRunDetail: (title: string, timestamp: string) => Promise<UiTaskRunDetailResponse | null>;

  /**
   * 发送 consoleui channel 指令。
   */
  sendConsoleUiMessage: () => Promise<void>;

  /**
   * 清理指定 session 的消息历史。
   */
  clearSessionMessages: (sessionId: string) => Promise<void>;

  /**
   * 清理指定 context 的 chat history。
   */
  clearChatHistory: (sessionId: string) => Promise<void>;

  /**
   * 完整删除指定 session。
   */
  deleteChatSession: (sessionId: string) => Promise<boolean>;

  /**
   * 切换 active model。
   */
  switchModel: (primaryModelId: string) => Promise<void>;

  /**
   * 按指定 agent 切换 primary model。
   */
  switchModelForAgent: (agentId: string, primaryModelId: string) => Promise<void>;

  /**
   * 更新指定 agent 的执行模式。
   */
  updateAgentExecution: (input: {
    agentId: string;
    executionMode: "model" | "acp";
    modelId?: string;
    agentType?: string;
  }) => Promise<void>;

  /**
   * 启动历史 agent。
   */
  startAgentFromHistory: (
    agentId: string,
    options?: {
      initializeIfNeeded?: boolean;
      initialization?: UiAgentInitializationInput;
    },
  ) => Promise<void>;

  /**
   * 新建 agent。
   */
  createAgent: (input: UiAgentCreatePayload) => Promise<void>;

  /**
   * 打开系统目录选择器。
   */
  pickAgentDirectory: () => Promise<string>;

  /**
   * 探测目录是否已初始化为 agent 项目。
   */
  inspectAgentDirectory: (projectRoot: string) => Promise<UiAgentDirectoryInspection | null>;

  /**
   * 重启指定 agent。
   */
  restartAgentFromHistory: (agentId: string) => Promise<void>;

  /**
   * 停止指定 agent。
   */
  stopAgentFromHistory: (agentId: string) => Promise<void>;

  /**
   * 新增或更新 provider。
   */
  upsertModelProvider: (input: {
    id: string;
    type: string;
    baseUrl?: string;
    apiKey?: string;
    clearBaseUrl?: boolean;
    clearApiKey?: boolean;
  }) => Promise<void>;

  /**
   * 删除 provider。
   */
  removeModelProvider: (providerId: string) => Promise<void>;

  /**
   * 测试 provider。
   */
  testModelProvider: (providerId: string) => Promise<void>;

  /**
   * 发现 provider 模型。
   */
  discoverModelProvider: (params: {
    providerId: string;
    autoAdd?: boolean;
    prefix?: string;
  }) => Promise<UiModelProviderDiscoverResult | null>;

  /**
   * 新增或更新 model。
   */
  upsertModelPoolItem: (input: {
    id: string;
    providerId: string;
    name: string;
    temperature?: string;
    maxTokens?: string;
    topP?: string;
    frequencyPenalty?: string;
    presencePenalty?: string;
    anthropicVersion?: string;
    isPaused?: boolean;
  }) => Promise<void>;

  /**
   * 删除 model。
   */
  removeModelPoolItem: (modelId: string) => Promise<void>;

  /**
   * 设置 model pause 状态。
   */
  setModelPoolItemPaused: (modelId: string, isPaused: boolean) => Promise<void>;

  /**
   * 测试 model。
   */
  testModelPoolItem: (modelId: string, prompt?: string) => Promise<void>;

  /**
   * 新增/更新 channel account。
   */
  upsertChannelAccount: (input: {
    id: string;
    channel: string;
    name: string;
    identity?: string;
    owner?: string;
    creator?: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
    clearBotToken?: boolean;
    clearAppId?: boolean;
    clearAppSecret?: boolean;
  }) => Promise<void>;

  /**
   * 探测 bot 凭据并自动获取 bot 信息。
   */
  probeChannelAccount: (input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  }) => Promise<UiChannelAccountProbeResult | null>;

  /**
   * 删除 channel account。
   */
  removeChannelAccount: (id: string) => Promise<void>;

  /**
   * 新增/更新 Console 全局 env。
   */
  upsertGlobalEnv: (input: {
    key: string;
    value: string;
  }) => Promise<void>;

  /**
   * 删除 Console 全局 env。
   */
  removeGlobalEnv: (key: string) => Promise<void>;

  /**
   * 批量导入 Console 全局 env。
   */
  importGlobalEnv: (raw: string) => Promise<void>;

  /**
   * 新增/更新当前 agent 私有 env。
   */
  upsertAgentEnv: (input: {
    agentId: string;
    key: string;
    value: string;
  }) => Promise<void>;

  /**
   * 删除当前 agent 私有 env。
   */
  removeAgentEnv: (agentId: string, key: string) => Promise<void>;

  /**
   * 批量导入 agent 私有 env。
   */
  importAgentEnv: (agentId: string, raw: string) => Promise<void>;

  /**
   * 执行 agent 项目目录下的 shell command。
   */
  executeAgentCommand: (input: {
    command: string;
    timeoutMs?: number;
    agentId?: string;
  }) => Promise<UiCommandExecuteResult>;

  /**
   * 常量集合。
   */
  constants: {
    CONSOLEUI_SESSION_ID: string;
  };

  /**
   * UI 工具函数。
   */
  uiHelpers: {
    formatTime: (ts?: number | string) => string;
    statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad";
  };

  /**
   * 登录 Console UI。
   */
  login: (input: { username: string; password: string; displayName?: string }) => Promise<void>;

  /**
   * 初始化首个管理员并直接进入 Console UI。
   */
  bootstrapAdmin: (input: {
    username: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;

  /**
   * 退出当前登录态。
   */
  logout: () => void;
}
