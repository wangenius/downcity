/**
 * Console Dashboard 环境、渠道与命令运行类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

import type { UiChatHistoryEvent } from "./SessionAndModelTypes";

/**
 * Shell approval 模式。
 *
 * 说明（中文）
 * - `ask` 表示当前 session 的 shell unrestricted 请求需要人工审批。
 * - `always-allow` 表示当前 session 内自动允许 shell approval。
 */
export type UiShellApprovalMode = "ask" | "always-allow";

/**
 * Shell approval 模式选项。
 */
export interface UiShellApprovalModeOption {
  /**
   * 模式值。
   */
  mode: UiShellApprovalMode;
  /**
   * 展示标签。
   */
  label: string;
  /**
   * 展示说明。
   */
  description: string;
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
   * 环境变量描述。
   */
  description?: string;
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
 * `/api/ui/agents/runtime-status` 响应。
 */
export interface UiAgentRuntimeStatusResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * agent 进程是否仍处于运行中。
   */
  running?: boolean;
  /**
   * runtime HTTP 服务是否已可访问。
   */
  serverReady?: boolean;
  /**
   * 关键 service 是否已完成启动。
   */
  servicesReady?: boolean;
  /**
   * 当前 runtime 是否包含 chat service。
   */
  hasChatService?: boolean;
  /**
   * 当前探活阶段的说明。
   */
  reason?: string;
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
     * 是否支持 chat account 绑定。
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
     * `downcity.json` 字段。
     */
    ship: UiChatChannelConfigurationField[];
    /**
     * chat account 字段。
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
