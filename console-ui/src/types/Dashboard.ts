/**
 * Console UI Dashboard 类型定义。
 *
 * 关键点（中文）
 * - 仅声明 UI 真正依赖的字段，避免对后端响应结构过度耦合。
 * - 所有字段默认可选，保证旧版本 runtime 下可降级渲染。
 */

/**
 * Agent 选项（来自 `/api/ui/agents`）。
 */
export interface UiAgentOption {
  /**
   * Agent 唯一标识（通常为 projectRoot）。
   */
  id: string;
  /**
   * Agent 展示名（ship.json.name 或目录名）。
   */
  name: string;
  /**
   * agent 项目根路径。
   */
  projectRoot?: string;
  /**
   * daemon 是否运行中。
   */
  running?: boolean;
  /**
   * Agent 运行主机地址。
   */
  host?: string;
  /**
   * Agent 运行端口。
   */
  port?: number;
  /**
   * Agent runtime baseUrl。
   */
  baseUrl?: string;
  /**
   * Agent daemon 进程号。
   */
  daemonPid?: number;
  /**
   * 最近停止时间（ISO8601，可选）。
   */
  stoppedAt?: string;
  /**
   * 最近更新时间（ISO8601，可选）。
   */
  updatedAt?: string;
  /**
   * 当前 agent 的 `ship.json.model.primary`。
   */
  primaryModelId?: string;
  /**
   * 当前 agent 的 chat 渠道运行快照。
   */
  chatProfiles?: Array<{
    /**
     * 渠道名（telegram/feishu/qq）。
     */
    channel?: string;
    /**
     * 链路状态。
     */
    linkState?: string;
    /**
     * 状态文案。
     */
    statusText?: string;
  }>;
}

/**
 * `/api/ui/agents` 响应。
 */
export interface UiAgentsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 DC CLI 版本号。
   */
  cityVersion?: string;
  /**
   * 当前可选 agent 列表。
   */
  agents?: UiAgentOption[];
  /**
   * 当前被后端选中的 agent id。
   */
  selectedAgentId?: string;
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
 * 配置文件状态项（来自 `/api/ui/config-status`）。
 */
export interface UiConfigStatusItem {
  /**
   * 配置文件逻辑名称（例如 `ship_json`、`console_pid`）。
   */
  key: string;
  /**
   * 作用域（`console` 或 `agent`）。
   */
  scope: "console" | "agent";
  /**
   * 展示标签。
   */
  label: string;
  /**
   * 配置文件绝对路径。
   */
  path: string;
  /**
   * 文件是否存在。
   */
  exists: boolean;
  /**
   * 是否为普通文件。
   */
  isFile: boolean;
  /**
   * 是否可读。
   */
  readable: boolean;
  /**
   * 文件大小（字节）。
   */
  sizeBytes: number;
  /**
   * 最后修改时间（ISO8601）。
   */
  mtime: string;
  /**
   * 状态（ok/missing/error）。
   */
  status: "ok" | "missing" | "error";
  /**
   * 状态原因。
   */
  reason: string;
}

/**
 * `/api/ui/config-status` 响应。
 */
export interface UiConfigStatusResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * 当前选中的 agent 名称。
   */
  selectedAgentName?: string;
  /**
   * 配置文件状态列表。
   */
  items?: UiConfigStatusItem[];
}

/**
 * Context 概览项。
 */
export interface UiOverviewContextItem {
  /**
   * Context 唯一标识。
   */
  contextId?: string;
}

/**
 * TUI context 摘要项。
 */
export interface UiContextSummary {
  /**
   * context 唯一标识。
   */
  contextId: string;
  /**
   * context 关联的渠道名称（例如 `telegram` / `qq` / `feishu` / `consoleui`）。
   * - 由后端按 `contextId -> channel` 映射解析后回传。
   * - 当历史数据缺失映射时可能为空，前端需自行回退解析。
   */
  channel?: string;
  /**
   * 该 context 对应的渠道侧会话标识（如 telegram chat id / qq openid）。
   */
  chatId?: string;
  /**
   * 渠道会话展示名（如群名、频道名、私聊对象名）。
   */
  chatTitle?: string;
  /**
   * 渠道会话类型（例如 `private` / `group` / `channel`）。
   */
  chatType?: string;
  /**
   * 渠道线程 ID（仅线程型渠道存在，例如 Telegram topic）。
   */
  threadId?: number;
  /**
   * 消息总数。
   */
  messageCount?: number;
  /**
   * 最近更新时间戳。
   */
  updatedAt?: number;
  /**
   * 最后一条消息角色。
   */
  lastRole?: string;
  /**
   * 最后一条消息摘要。
   */
  lastText?: string;
}

/**
 * `/api/tui/contexts` 响应。
 */
export interface UiContextsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context 列表。
   */
  contexts?: UiContextSummary[];
}

/**
 * `/api/tui/overview` 响应。
 */
export interface UiOverviewResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 DC CLI 版本号。
   */
  cityVersion?: string;
  /**
   * 当前 agent 基础信息。
   */
  agent?: {
    /**
     * agent 展示名。
     */
    name?: string;
  };
  /**
   * 上下文统计信息。
   */
  contexts?: {
    /**
     * context 总数。
     */
    total?: number;
    /**
     * context 列表。
     */
    items?: UiOverviewContextItem[];
  };
  /**
   * 任务统计信息。
   */
  tasks?: {
    /**
     * task 总数。
     */
    total?: number;
    /**
     * task 状态计数。
     */
    statusCount?: {
      /**
       * enabled 数量。
       */
      enabled?: number;
      /**
       * paused 数量。
       */
      paused?: number;
      /**
       * disabled 数量。
       */
      disabled?: number;
    };
  };
}

/**
 * Service 状态项。
 */
export interface UiServiceItem {
  /**
   * Service 名称（新字段）。
   */
  name?: string;
  /**
   * Service 名称（兼容字段）。
   */
  service?: string;
  /**
   * Service 状态（新字段）。
   */
  state?: string;
  /**
   * Service 状态（兼容字段）。
   */
  status?: string;
}

/**
 * `/api/tui/services` 响应。
 */
export interface UiServicesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * service 列表。
   */
  services?: UiServiceItem[];
}

/**
 * Skill 列表项（来自 `service=skill` 的 `list` 命令）。
 */
export interface UiSkillSummaryItem {
  /**
   * skill 唯一标识（目录 id）。
   */
  id: string;
  /**
   * skill 展示名。
   */
  name: string;
  /**
   * skill 描述。
   */
  description: string;
  /**
   * skill 来源（project/home/external）。
   */
  source: string;
  /**
   * SKILL.md 绝对路径。
   */
  skillMdPath: string;
  /**
   * 允许使用的工具列表。
   */
  allowedTools: string[];
}

/**
 * skills list 响应（`/api/services/command`）。
 */
export interface UiSkillListResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 返回数据体。
   */
  data?: {
    /**
     * 已发现的 skill 列表。
     */
    skills?: UiSkillSummaryItem[];
  };
}

/**
 * skills.find 请求载荷。
 */
export interface UiSkillFindPayload {
  /**
   * 要查找的 skill 关键词。
   */
  query: string;
}

/**
 * skills.install 请求载荷。
 */
export interface UiSkillInstallPayload {
  /**
   * 目标 skill 安装描述（例如 `owner/repo@skill-id`）。
   */
  spec: string;
  /**
   * 是否全局安装（对应 `--global`）。
   */
  global?: boolean;
  /**
   * 是否跳过安装确认（对应 `--yes`）。
   */
  yes?: boolean;
  /**
   * 安装目标 agent（对应 `--agent`）。
   */
  agent?: string;
}

/**
 * skills.find 返回数据。
 */
export interface UiSkillFindResult {
  /**
   * 原始查询词。
   */
  query?: string;
  /**
   * 运行结果文案。
   */
  message?: string;
  /**
   * 推荐工作流步骤。
   */
  workflow?: string[];
  /**
   * 建议下一步动作。
   */
  nextAction?: string;
  /**
   * 已学会 skill（精确命中）。
   */
  learnedSkill?: UiSkillSummaryItem | null;
  /**
   * 已学会 skill 的模糊提示列表。
   */
  learnedHints?: UiSkillSummaryItem[];
}

/**
 * skills.install 返回数据。
 */
export interface UiSkillInstallResult {
  /**
   * 原始安装 spec。
   */
  spec?: string;
  /**
   * 运行结果文案。
   */
  message?: string;
  /**
   * 推荐工作流步骤。
   */
  workflow?: string[];
  /**
   * 建议下一步动作。
   */
  nextAction?: string;
  /**
   * 是否跳过安装（因为已存在）。
   */
  skipped?: boolean;
  /**
   * 从 spec 推断出的 skill 查询词。
   */
  queryFromSpec?: string;
  /**
   * 本次新增的 skill 列表。
   */
  addedSkills?: UiSkillSummaryItem[];
  /**
   * 当前可用的目标 skill。
   */
  learnedSkill?: UiSkillSummaryItem | null;
}

/**
 * skills.lookup 返回数据。
 */
export interface UiSkillLookupResult {
  /**
   * lookup 是否成功。
   */
  success?: boolean;
  /**
   * 命中的 skill 元信息。
   */
  skill?: UiSkillSummaryItem;
  /**
   * lookup 结果文案。
   */
  message?: string;
}

/**
 * skill 指令统一响应体。
 */
export interface UiSkillCommandResponse<TData> {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 指令数据载荷。
   */
  data?: TData;
  /**
   * 错误文案（兼容字段）。
   */
  error?: string;
  /**
   * 附加消息（兼容字段）。
   */
  message?: string;
}

/**
 * Extension 运行时快照。
 */
export interface UiExtensionRuntimeItem {
  /**
   * extension 名称。
   */
  name?: string;
  /**
   * extension 描述信息。
   */
  description?: string;
  /**
   * extension 运行状态。
   */
  state?: string;
  /**
   * 最近更新时间戳。
   */
  updatedAt?: number;
  /**
   * 最近错误信息。
   */
  lastError?: string;
  /**
   * 最近命令名。
   */
  lastCommand?: string;
  /**
   * 最近命令时间戳。
   */
  lastCommandAt?: number;
  /**
   * 是否支持 lifecycle 控制。
   */
  supportsLifecycle?: boolean;
  /**
   * 是否支持 command 调用。
   */
  supportsCommand?: boolean;
  /**
   * extension 配置摘要（由 console ui 接口返回）。
   */
  config?: {
    /**
     * 生命周期钩子支持情况。
     */
    lifecycle?: {
      /**
       * 是否支持 start。
       */
      start?: boolean;
      /**
       * 是否支持 stop。
       */
      stop?: boolean;
      /**
       * 是否支持 lifecycle.command。
       */
      command?: boolean;
    };
    /**
     * action 能力清单。
     */
    actions?: Array<{
      /**
       * action 名称。
       */
      name?: string;
      /**
       * 是否支持 CLI command。
       */
      supportsCommand?: boolean;
      /**
       * 是否支持 HTTP API。
       */
      supportsApi?: boolean;
      /**
       * CLI command 描述。
       */
      commandDescription?: string;
      /**
       * API method（若存在）。
       */
      apiMethod?: string;
      /**
       * API path（若存在）。
       */
      apiPath?: string;
    }>;
  };
}

/**
 * `/api/extensions/list` 响应。
 */
export interface UiExtensionsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * extension 列表。
   */
  extensions?: UiExtensionRuntimeItem[];
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
 * Chat 渠道配置字段类型。
 */
export type UiChatChannelConfigurationFieldType =
  | "string"
  | "boolean"
  | "number"
  | "secret"
  | "enum";

/**
 * Chat 渠道配置字段来源。
 */
export type UiChatChannelConfigurationFieldSource =
  | "ship_json"
  | "bot_account"
  | "env_fallback";

/**
 * 配置字段枚举选项。
 */
export interface UiChatChannelConfigurationFieldOption {
  /**
   * 选项实际值。
   */
  value: string;
  /**
   * 选项展示标签。
   */
  label: string;
  /**
   * 选项用途说明。
   */
  description: string;
}

/**
 * Env 条目 scope。
 */
export type UiEnvScope = "global" | "agent";

/**
 * Env 管理项（来自 `/api/ui/env`）。
 */
export interface UiEnvItem {
  /**
   * 作用域（global 或 agent）。
   */
  scope: UiEnvScope;
  /**
   * 环境变量 key。
   */
  key: string;
  /**
   * 环境变量值（明文，仅在当前 UI 会话内展示）。
   */
  value: string;
  /**
   * 对于 agent 级 env，关联的 agentId（projectRoot）。
   */
  agentId?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt?: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt?: string;
}

/**
 * `/api/ui/env` 响应。
 */
export interface UiEnvListResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前作用域。
   */
  scope?: UiEnvScope;
  /**
   * 当前 agentId（仅 scope=agent 时存在）。
   */
  agentId?: string;
  /**
   * 环境变量列表。
   */
  items?: UiEnvItem[];
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * Chat 渠道配置字段定义。
 */
export interface UiChatChannelConfigurationField {
  /**
   * 字段键名。
   */
  key: string;
  /**
   * 字段标签。
   */
  label: string;
  /**
   * 字段说明。
   */
  description: string;
  /**
   * 字段类型。
   */
  type: UiChatChannelConfigurationFieldType;
  /**
   * 字段来源。
   */
  source: UiChatChannelConfigurationFieldSource;
  /**
   * 是否必填。
   */
  required: boolean;
  /**
   * 是否允许 `null`。
   */
  nullable: boolean;
  /**
   * 是否允许写入。
   */
  writable: boolean;
  /**
   * 变更后是否需要重启。
   */
  restartRequired: boolean;
  /**
   * 默认值（若存在）。
   */
  defaultValue?: string | number | boolean | null;
  /**
   * 示例值（若存在）。
   */
  example?: string | number | boolean | null;
  /**
   * 枚举选项。
   */
  options?: UiChatChannelConfigurationFieldOption[];
}

/**
 * Chat 渠道配置描述器。
 */
export interface UiChatChannelConfigurationDescriptor {
  /**
   * 渠道名。
   */
  channel: string;
  /**
   * 配置标题。
   */
  title: string;
  /**
   * 配置说明。
   */
  description: string;
  /**
   * 描述器版本。
   */
  version: string;
  /**
   * 渠道能力开关。
   */
  capabilities?: {
    /**
     * 是否支持 enabled 开关。
     */
    canToggleEnabled?: boolean;
    /**
     * 是否支持 channel account 绑定。
     */
    canBindChannelAccount?: boolean;
    /**
     * 是否支持配置写入。
     */
    canConfigure?: boolean;
  };
  /**
   * 字段分组。
   */
  fields: {
    /**
     * `ship.json` 字段。
     */
    ship: UiChatChannelConfigurationField[];
    /**
     * channel account 字段。
     */
    channelAccount: UiChatChannelConfigurationField[];
    /**
     * env fallback 字段。
     */
    envFallback: UiChatChannelConfigurationField[];
  };
}

/**
 * Chat 渠道详情结构。
 */
export interface UiChatChannelDetail {
  /**
   * 可安全展示的配置摘要。
   */
  config?: Record<string, unknown>;
  /**
   * 配置元信息描述器。
   */
  configuration?: UiChatChannelConfigurationDescriptor;
  /**
   * 渠道是否只读。
   */
  readonly?: boolean;
  /**
   * 其余动态诊断字段。
   */
  [key: string]: unknown;
}

/**
 * Chat 渠道运行状态项。
 */
export interface UiChatChannelStatus {
  /**
   * 渠道名称，例如 qq/telegram。
   */
  channel?: string;
  /**
   * 链接状态文本。
   */
  linkState?: string;
  /**
   * 运行状态文本。
   */
  statusText?: string;
  /**
   * 渠道进程是否运行中。
   */
  running?: boolean;
  /**
   * 渠道是否启用。
   */
  enabled?: boolean;
  /**
   * 渠道是否已配置。
   */
  configured?: boolean;
  /**
   * 渠道附加诊断信息。
   *
   * 关键点（中文）
   * - 由 runtime/status 动态返回，字段不保证完全稳定。
   * - `detail.config` 中放置可安全展示的配置摘要（不含明文密钥）。
   */
  detail?: UiChatChannelDetail;
}

/**
 * `/api/services/command` chat.status 响应。
 */
export interface UiChatStatusResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 业务数据载荷。
   */
  data?: {
    /**
     * 渠道状态列表。
     */
    channels?: UiChatChannelStatus[];
    /**
     * 渠道测试结果列表。
     */
    results?: UiChatActionResult[];
    /**
     * history 事件列表（chat.history）。
     */
    events?: UiChatHistoryEvent[];
    /**
     * history 事件数量。
     */
    count?: number;
    /**
     * history 文件路径。
     */
    historyPath?: string;
  };
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
 * chat test/reconnect 动作结果。
 */
export interface UiChatActionResult {
  /**
   * 渠道名。
   */
  channel?: string;
  /**
   * 是否执行成功。
   */
  success?: boolean;
  /**
   * 动作反馈信息。
   */
  message?: string;
}

/**
 * command 执行结果。
 */
export interface UiCommandExecuteResult {
  /**
   * 实际执行的命令文本。
   */
  command: string;
  /**
   * 执行工作目录（agent 项目根目录）。
   */
  cwd: string;
  /**
   * 进程退出码；被信号终止时可能为空。
   */
  exitCode?: number | null;
  /**
   * 进程终止信号（如 SIGTERM）。
   */
  signal?: string;
  /**
   * 是否命中执行超时。
   */
  timedOut: boolean;
  /**
   * 执行耗时（毫秒）。
   */
  durationMs: number;
  /**
   * 标准输出内容。
   */
  stdout: string;
  /**
   * 标准错误内容。
   */
  stderr: string;
}

/**
 * `/api/ui/command/execute` 响应。
 */
export interface UiCommandExecuteResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 选中的 agent id。
   */
  agentId?: string;
  /**
   * command 执行结果。
   */
  result?: UiCommandExecuteResult;
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 任务状态项。
 */
export interface UiTaskItem {
  /**
   * 任务名称（主字段）。
   */
  title?: string;
  /**
   * 任务状态。
   */
  status?: string;
  /**
   * 触发条件（@manual | cron | time:ISO8601）。
   */
  when?: string;
  /**
   * 任务描述。
   */
  description?: string;
  /**
   * 任务正文（task.md frontmatter 之后的 body）。
   */
  body?: string;
  /**
   * 任务所属 contextId。
   */
  contextId?: string;
  /**
   * 任务类型（agent/script）。
   */
  kind?: "agent" | "script" | string;
  /**
   * 任务正文文件路径。
   */
  taskMdPath?: string;
  /**
   * 最近一次执行时间戳目录名。
   */
  lastRunTimestamp?: string;
}

/**
 * `/api/tui/tasks` 响应。
 */
export interface UiTasksResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 列表。
   */
  tasks?: UiTaskItem[];
}

/**
 * 任务状态值。
 */
export type UiTaskStatusValue = "enabled" | "paused" | "disabled";

/**
 * task 通用变更响应（状态切换/删除）。
 */
export interface UiTaskMutationResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 任务名称。
   */
  title?: string;
  /**
   * 任务状态（状态更新接口时返回）。
   */
  status?: UiTaskStatusValue | string;
  /**
   * 任务目录路径（删除任务时可选返回）。
   */
  taskDirPath?: string;
  /**
   * 服务层补充信息（如 scheduler reload 信息）。
   */
  scheduler?: Record<string, unknown>;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 可选提示文案。
   */
  message?: string;
}

/**
 * 任务执行摘要项。
 */
export interface UiTaskRunSummary {
  /**
   * 运行时间戳目录名（YYYYMMDD-HHmmss-SSS）。
   */
  timestamp: string;
  /**
   * 任务最终状态。
   */
  status?: string;
  /**
   * 执行器状态。
   */
  executionStatus?: string;
  /**
   * 结果状态。
   */
  resultStatus?: string;
  /**
   * 是否仍在执行中。
   */
  inProgress?: boolean;
  /**
   * 当前执行阶段（来自 run-progress.json）。
   */
  progressPhase?: string;
  /**
   * 当前阶段说明（来自 run-progress.json）。
   */
  progressMessage?: string;
  /**
   * 最近进度更新时间（毫秒）。
   */
  progressUpdatedAt?: number;
  /**
   * 当前执行轮次（agent 任务可选）。
   */
  progressRound?: number;
  /**
   * 最大执行轮次（agent 任务可选）。
   */
  progressMaxRounds?: number;
  /**
   * 开始时间戳（毫秒）。
   */
  startedAt?: number;
  /**
   * 结束时间戳（毫秒）。
   */
  endedAt?: number;
  /**
   * 对话轮数。
   */
  dialogueRounds?: number;
  /**
   * 用户模拟满意度。
   */
  userSimulatorSatisfied?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * run 目录相对路径。
   */
  runDirRel?: string;
}

/**
 * 任务执行详情项。
 */
export interface UiTaskRunDetail {
  /**
   * task 名称。
   */
  title?: string;
  /**
   * 运行时间戳目录名。
   */
  timestamp?: string;
  /**
   * run 目录相对路径。
   */
  runDirRel?: string;
  /**
   * run 元数据（run.json）。
   */
  meta?: Record<string, unknown>;
  /**
   * 运行进度快照（run-progress.json）。
   */
  progress?: {
    /**
     * 当前进度状态（running/success/failure）。
     */
    status?: string;
    /**
     * 当前阶段标识。
     */
    phase?: string;
    /**
     * 当前阶段说明文案。
     */
    message?: string;
    /**
     * 开始时间（毫秒）。
     */
    startedAt?: number;
    /**
     * 最近更新时间（毫秒）。
     */
    updatedAt?: number;
    /**
     * 结束时间（毫秒）。
     */
    endedAt?: number;
    /**
     * 当前轮次（agent 场景可选）。
     */
    round?: number;
    /**
     * 最大轮次（agent 场景可选）。
     */
    maxRounds?: number;
    /**
     * 最终 run 状态（可选）。
     */
    runStatus?: string;
    /**
     * 最终执行状态（可选）。
     */
    executionStatus?: string;
    /**
     * 最终结果状态（可选）。
     */
    resultStatus?: string;
    /**
     * 最近进度事件列表（时间顺序）。
     */
    events?: Array<{
      /**
       * 事件时间（毫秒）。
       */
      at?: number;
      /**
       * 事件阶段标识。
       */
      phase?: string;
      /**
       * 事件说明文案。
       */
      message?: string;
      /**
       * 事件对应轮次（可选）。
       */
      round?: number;
      /**
       * 事件对应最大轮次（可选）。
       */
      maxRounds?: number;
    }>;
  };
  /**
   * 对话元数据（dialogue.json）。
   */
  dialogue?: Record<string, unknown>;
  /**
   * 产物文本集合。
   */
  artifacts?: {
    /**
     * 输入文本。
     */
    input?: string;
    /**
     * 输出文本。
     */
    output?: string;
    /**
     * 结果文本。
     */
    result?: string;
    /**
     * 对话文本。
     */
    dialogue?: string;
    /**
     * 错误文本。
     */
    error?: string;
  };
  /**
   * 执行消息时间线。
   */
  messages?: UiContextTimelineMessage[];
}

/**
 * `/api/tui/tasks/:title/runs` 响应。
 */
export interface UiTaskRunsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 名称。
   */
  title?: string;
  /**
   * 执行摘要列表。
   */
  runs?: UiTaskRunSummary[];
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * `/api/tui/tasks/:title/runs/:timestamp` 响应。
 */
export interface UiTaskRunDetailResponse extends UiTaskRunDetail {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 删除 task run 记录响应。
 */
export interface UiTaskRunDeleteResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 标题。
   */
  title?: string;
  /**
   * 被删除的 run 时间戳目录名。
   */
  timestamp?: string;
  /**
   * 是否完成删除。
   */
  deleted?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 批量清理 task run 记录响应。
 */
export interface UiTaskRunsClearResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 标题。
   */
  title?: string;
  /**
   * 已删除 run 数量。
   */
  deletedCount?: number;
  /**
   * 因“仍在运行”而跳过的 run 数量。
   */
  skippedRunningCount?: number;
  /**
   * 已删除 run 的时间戳目录列表。
   */
  deletedTimestamps?: string[];
  /**
   * 被跳过（运行中）的 run 时间戳目录列表。
   */
  skippedRunningTimestamps?: string[];
  /**
   * 错误信息。
   */
  error?: string;
}

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
 * `/api/tui/logs` 响应。
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
 * `/api/tui/system-prompt` 响应。
 */
export interface UiPromptResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 context id。
   */
  contextId?: string;
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
 * local_ui 消息项。
 */
export interface UiLocalMessage {
  /**
   * 角色。
   */
  role?: string;
  /**
   * 文本内容。
   */
  text?: string;
  /**
   * 时间戳。
   */
  ts?: number | string;
}

/**
 * context 时间线消息项（来自 `/api/tui/contexts/:id/messages`）。
 */
export interface UiContextTimelineMessage {
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
 * `/api/tui/contexts/:id/messages` 响应。
 */
export interface UiContextMessagesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context id。
   */
  contextId?: string;
  /**
   * 时间线消息列表。
   */
  messages?: UiContextTimelineMessage[];
}

/**
 * context compact archive 摘要项。
 */
export interface UiContextArchiveSummary {
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
 * `/api/tui/contexts/:id/archives` 响应。
 */
export interface UiContextArchivesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context id。
   */
  contextId?: string;
  /**
   * archive 列表。
   */
  archives?: UiContextArchiveSummary[];
}

/**
 * `/api/tui/contexts/:id/archives/:archiveId` 响应。
 */
export interface UiContextArchiveDetailResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context id。
   */
  contextId?: string;
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
  messages?: UiContextTimelineMessage[];
}

/**
 * 通用“清理成功”响应。
 */
export interface UiContextClearResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context id。
   */
  contextId?: string;
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
   * 被删除的 context id。
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
   * 是否删除了 context 目录。
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
   * context id。
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
 * `/api/tui/contexts/:id/messages` 响应。
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
   * 当前 agent 绑定模型 id（model.primary）。
   */
  primaryModelId?: string;
  /**
   * 当前 agent 的 model.primary 绑定。
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
   * 主人鉴权 ID。
   */
  authId?: string;
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
