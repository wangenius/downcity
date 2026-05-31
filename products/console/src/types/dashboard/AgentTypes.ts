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
   * Agent 项目自身的稳定 id（优先 `downcity.json.id`，回退目录名）。
   */
  agentId: string;
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
   * 当前 agent 的执行模式。
   */
  executionMode?: "api" | "acp" | "local";
  /**
   * 当前 agent 的 `downcity.json.execution.modelId`。
   */
  modelId?: string;
  /**
   * 当前 agent 的 `downcity.json.plugins.lmp.model`。
   */
  localModel?: string;
  /**
   * 当前 agent 的 `downcity.json.execution.agent.type`。
   */
  agentType?: string;
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
 * Agent 初始化输入。
 */
export interface UiAgentInitializationInput {
  /**
   * agent 项目根目录。
   */
  projectRoot: string;
  /**
   * agent 项目 id（会写入 `downcity.json.id`）。
   */
  id?: string;
  /**
   * 执行模式。
   */
  executionMode: "api" | "acp" | "local";
  /**
   * API 执行模式下的模型 ID。
   */
  modelId?: string;
  /**
   * Local 执行模式下的 GGUF 文件名。
   */
  localModel?: string;
  /**
   * ACP 执行模式下的 agent 类型。
   */
  agentType?: string;
}

/**
 * Console UI 新建 agent 请求。
 */
export interface UiAgentCreatePayload extends UiAgentInitializationInput {
  /**
   * 创建后是否立即启动。
   */
  autoStart?: boolean;
}

/**
 * Agent 目录探测结果。
 */
export interface UiAgentDirectoryInspection {
  /**
   * 被探测的 agent 项目根目录。
   */
  projectRoot: string;
  /**
   * 该目录是否已具备最小初始化条件。
   */
  initialized: boolean;
  /**
   * `downcity.json` 是否存在。
   */
  hasShipJson: boolean;
  /**
   * `PROFILE.md` 是否存在。
   */
  hasProfileMd: boolean;
  /**
   * 该目录是否已出现在 console registry 中。
   */
  knownAgent: boolean;
  /**
   * 若已登记，当前是否运行中。
   */
  running: boolean;
  /**
   * 当前目录解析出的 agent 项目 id。
   */
  agentId?: string;
  /**
   * 当前读取到的执行模式。
   */
  executionMode?: "api" | "acp" | "local";
  /**
   * 当前读取到的主模型 ID。
   */
  modelId?: string;
  /**
   * 当前读取到的本地模型文件名。
   */
  localModel?: string;
  /**
   * 当前读取到的 ACP agent 类型。
   */
  agentType?: string;
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
 * 本地 GGUF 模型列表响应。
 */
export interface UiLocalModelsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 实际扫描使用的模型目录。
   */
  modelsDir?: string;
  /**
   * 当前发现的本地模型文件列表。
   */
  models?: string[];
  /**
   * 错误信息。
   */
  error?: string;
}
