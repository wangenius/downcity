/**
 * Console Dashboard 服务、技能与插件类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

/**
 * Service 状态项。
 */
export interface UiServiceItem {
  /**
   * Service 名称。
   */
  name: string;

  /**
   * 兼容旧字段的 service 名称。
   */
  service?: string;
  /**
   * Service 状态。
   */
  state: string;

  /**
   * 兼容旧字段的状态值。
   */
  status?: string;

  /**
   * Service 描述。
   */
  description?: string;
}

/**
 * `/api/dashboard/services` 响应。
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
 * Skill 列表项（来自 `plugin=skill` 的 `list` action）。
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
 * skills list 响应（`/api/plugins/action`）。
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
 * skill plugin action 统一响应体。
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
 * Plugin action 摘要。
 */
export interface UiPluginActionItem {
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
}

/**
 * Plugin setup 字段选项。
 */
export interface UiPluginSetupFieldOption {
  /**
   * 选项展示标签。
   */
  label: string;
  /**
   * 选项实际值。
   */
  value: string;
  /**
   * 选项补充说明（可选）。
   */
  hint?: string;
}

/**
 * Plugin setup 字段定义。
 */
export interface UiPluginSetupField {
  /**
   * 字段稳定键。
   */
  key: string;
  /**
   * 字段展示标签。
   */
  label: string;
  /**
   * 字段类型。
   */
  type: "select" | "checkbox";
  /**
   * 是否必填。
   */
  required?: boolean;
  /**
   * 静态选项（可选）。
   */
  options?: UiPluginSetupFieldOption[];
  /**
   * 动态选项来源 action（可选）。
   */
  sourceAction?: string;
}

/**
 * Plugin setup 定义。
 */
export interface UiPluginSetupDefinition {
  /**
   * setup 模式。
   */
  mode: "install" | "configure" | "install-configure";
  /**
   * setup 标题。
   */
  title: string;
  /**
   * setup 说明（可选）。
   */
  description?: string;
  /**
   * 字段列表。
   */
  fields: UiPluginSetupField[];
  /**
   * 主动作 action 名称。
   */
  primaryAction: string;
  /**
   * 状态同步 action 名称（可选）。
   */
  statusAction?: string;
}

/**
 * Plugin usage 字段选项。
 */
export interface UiPluginUsageFieldOption {
  /**
   * 选项展示标签。
   */
  label: string;
  /**
   * 选项实际值。
   */
  value: string;
  /**
   * 选项补充说明（可选）。
   */
  description?: string;
}

/**
 * Plugin usage 字段定义。
 */
export interface UiPluginUsageField {
  /**
   * 字段稳定键。
   */
  key: string;
  /**
   * 字段展示标签。
   */
  label: string;
  /**
   * 字段类型。
   */
  type: "string" | "secret" | "boolean" | "select" | "number";
  /**
   * 字段占位文案（可选）。
   */
  placeholder?: string;
  /**
   * 字段说明文案（可选）。
   */
  description?: string;
  /**
   * 是否必填。
   */
  required?: boolean;
  /**
   * 是否禁用。
   */
  disabled?: boolean;
  /**
   * 布尔字段为 true 时的标签（可选）。
   */
  trueLabel?: string;
  /**
   * 布尔字段为 false 时的标签（可选）。
   */
  falseLabel?: string;
  /**
   * 静态选项列表（可选）。
   */
  options?: UiPluginUsageFieldOption[];
  /**
   * 动态选项来源 action（可选）。
   */
  sourceAction?: string;
}

/**
 * Plugin usage 定义。
 */
export interface UiPluginUsageDefinition {
  /**
   * 面板标题。
   */
  title: string;
  /**
   * 面板说明（可选）。
   */
  description?: string;
  /**
   * 字段列表。
   */
  fields: UiPluginUsageField[];
  /**
   * 保存 usage 配置时调用的 action。
   */
  saveAction: string;
  /**
   * 状态同步 action 名称（可选）。
   */
  statusAction?: string;
}

/**
 * Plugin 可用性摘要。
 */
export interface UiPluginAvailability {
  /**
   * Plugin 是否已启用。
   */
  enabled?: boolean;
  /**
   * Plugin 当前是否可用。
   */
  available?: boolean;
  /**
   * 不可用原因列表。
   */
  reasons?: string[];
  /**
   * 缺失的 asset 列表。
   */
  missingAssets?: string[];
}

/**
 * Plugin 运行时快照。
 */
export interface UiPluginRuntimeItem {
  /**
   * Plugin 名称。
   */
  name?: string;
  /**
   * Plugin 展示标题。
   */
  title?: string;
  /**
   * Plugin 面向人类的用途说明。
   */
  description?: string;
  /**
   * 暴露的 pipeline 点名称列表。
   */
  pipelines?: string[];
  /**
   * 暴露的 guard 点名称列表。
   */
  guards?: string[];
  /**
   * 暴露的 effect 点名称列表。
   */
  effects?: string[];
  /**
   * 暴露的 resolve 点名称列表。
   */
  resolves?: string[];
  /**
   * 依赖的 asset 名称列表。
   */
  requiredAssets?: string[];
  /**
   * 是否声明了 system 注入。
   */
  hasSystem?: boolean;
  /**
   * 是否声明了 availability 检查。
   */
  hasAvailability?: boolean;
  /**
   * 归一化后的展示状态。
   */
  state?: string;
  /**
   * 归一化后的错误摘要。
   */
  lastError?: string;
  /**
   * Plugin 可用性结果。
   */
  availability?: UiPluginAvailability;
  /**
   * Plugin 配置摘要（由 console ui 接口返回）。
   */
  config?: {
    /**
     * action 能力清单。
     */
    actions?: UiPluginActionItem[];
    /**
     * setup 协议（可选）。
     */
    setup?: UiPluginSetupDefinition;
    /**
     * usage 协议（可选）。
     */
    usage?: UiPluginUsageDefinition;
  };
}

/**
 * Plugin action 执行结果。
 */
export interface UiPluginActionExecutionResult {
  /**
   * action 是否执行成功。
   */
  success: boolean
  /**
   * 返回给 UI 的结果文案。
   */
  message: string
  /**
   * action 返回的数据载荷。
   */
  data?: unknown
  /**
   * action 附带的日志行（可选）。
   */
  logs?: string[]
}

/**
 * `/api/ui/plugins` 响应。
 */
export interface UiPluginsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * plugin 列表。
   */
  plugins?: UiPluginRuntimeItem[];
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}
