/**
 * Console 相关类型定义。
 *
 * 关键点（中文）
 * - UI 由 console 独立提供，不和单个 agent 进程绑定。
 * - 同一个 UI 进程可切换查看多个已登记的 agent。
 */

/**
 * Console 中单个 agent 选项。
 */
export interface ConsoleAgentOption {
  /**
   * UI 侧唯一标识（使用 projectRoot 绝对路径）。
   */
  id: string;

  /**
   * agent 显示名称（优先 downcity.json.name，回退目录名）。
   */
  name: string;

  /**
   * agent 项目根目录（绝对路径）。
   */
  projectRoot: string;

  /**
   * 当前 daemon 是否存活。
   */
  running: boolean;

  /**
   * 可访问的 runtime 主机地址（已归一化，不会是 0.0.0.0/::）。
   */
  host?: string;

  /**
   * runtime 端口。
   */
  port?: number;

  /**
   * runtime 基础地址（例如 http://127.0.0.1:5314）。
   */
  baseUrl?: string;

  /**
   * registry 首次登记时间（ISO8601）。
   */
  startedAt: string;

  /**
   * registry 最近刷新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * 最近停止时间（ISO8601，可选）。
   */
  stoppedAt?: string;

  /**
   * 当前读取到的 daemon pid（仅 running=true 时有值）。
   */
  daemonPid?: number;

  /**
   * daemon 日志路径（用于排障展示）。
   */
  logPath?: string;

  /**
   * 当前 agent 的 chat 渠道运行快照。
   */
  chatProfiles?: Array<{
    /**
     * 渠道名（telegram/feishu/qq）。
     */
    channel: string;
    /**
     * 链路状态（connected/disconnected/unknown）。
     */
    linkState?: string;
    /**
     * 状态文案（如 polling/ws_online/config_missing）。
     */
    statusText?: string;
  }>;

  /**
   * 当前 agent 的执行模式。
   */
  executionMode?: "api" | "acp" | "local";

  /**
   * 当前 agent 的 `downcity.json.execution.modelId`。
   *
   * 说明（中文）
   * - 仅当 `executionMode=api` 时有值。
   */
  modelId?: string;

  /**
   * 当前 agent 的 `downcity.json.execution.agent.type`。
   */
  agentType?: string;
}

/**
 * `/api/ui/agents` 响应体。
 */
export interface ConsoleAgentsResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 当前 DC CLI 版本号。
   */
  cityVersion: string;

  /**
   * 当前可选的 agent 列表。
   */
  agents: ConsoleAgentOption[];

  /**
   * 当前选中的 agent id（无可用 agent 时为空字符串）。
   */
  selectedAgentId: string;
}

/**
 * 目录探测结果。
 */
export interface ConsoleAgentDirectoryInspection {
  /**
   * 探测的项目绝对路径。
   */
  projectRoot: string;

  /**
   * 该目录是否已满足最小 agent 初始化条件。
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
   * 若已登记，当前 daemon 是否运行中。
   */
  running: boolean;

  /**
   * 展示名称（优先 downcity.json.name，回退目录名）。
   */
  displayName: string;

  /**
   * 当前读取到的执行模式（若存在）。
   */
  executionMode?: "api" | "acp" | "local";

  /**
   * 当前读取到的主模型 ID（若存在）。
   */
  modelId?: string;

  /**
   * 当前读取到的 ACP agent 类型（若存在）。
   */
  agentType?: string;
}

/**
 * Console 后台进程元数据。
 */
export interface ConsoleRuntimeMeta {
  /**
   * UI 进程 pid。
   */
  pid: number;

  /**
   * UI 监听主机。
   */
  host: string;

  /**
   * UI 监听端口。
   */
  port: number;

  /**
   * 启动时间（ISO8601）。
   */
  startedAt: string;
}

/**
 * Console 运行状态视图。
 */
export interface ConsoleRuntimeStatus {
  /**
   * UI 是否运行中。
   */
  running: boolean;

  /**
   * UI pid（运行中时有值）。
   */
  pid?: number;

  /**
   * UI 监听主机（运行中时有值）。
   */
  host?: string;

  /**
   * UI 监听端口（运行中时有值）。
   */
  port?: number;

  /**
   * 可访问 URL（运行中时有值）。
   */
  url?: string;

  /**
   * UI 日志路径。
   */
  logPath: string;

  /**
   * 状态文件路径。
   */
  pidPath: string;
}

/**
 * 配置文件状态项。
 */
export interface ConsoleConfigFileStatusItem {
  /**
   * 配置文件逻辑名称（例如 `ship_json`、`console_pid`）。
   */
  key: string;

  /**
   * 配置文件分组（`console` 或 `agent`）。
   */
  scope: "console" | "agent";

  /**
   * 配置文件展示标签。
   */
  label: string;

  /**
   * 配置文件绝对路径。
   */
  path: string;

  /**
   * 是否存在。
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
   * 归一化状态（ok/missing/error）。
   */
  status: "ok" | "missing" | "error";

  /**
   * 状态原因（例如 `file_not_found`、`not_a_file`）。
   */
  reason: string;
}

/**
 * `/api/ui/config-status` 响应体。
 */
export interface ConsoleConfigStatusResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 当前选中的 agent id（可能为空）。
   */
  selectedAgentId: string;

  /**
   * 当前选中的 agent 名称（可能为空）。
   */
  selectedAgentName: string;

  /**
   * 配置文件状态列表。
   */
  items: ConsoleConfigFileStatusItem[];
}

/**
 * city registry 中的单条 agent 记录。
 */
export interface ConsoleAgentRegistryEntry {
  /**
   * agent 项目根目录绝对路径。
   */
  projectRoot: string;

  /**
   * registry 最近一次记录的 daemon pid。
   */
  pid: number;

  /**
   * 首次登记时间（ISO8601）。
   */
  startedAt: string;

  /**
   * 最近刷新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * registry 记录状态。
   */
  status: "running" | "stopped";

  /**
   * 最近停止时间（仅 stopped 时有值）。
   */
  stoppedAt?: string;
}

/**
 * city registry 文件结构。
 */
export interface ConsoleAgentRegistryV1 {
  /**
   * registry schema 版本。
   */
  v: 1;

  /**
   * registry 最近更新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * 当前登记的 agent 列表。
   */
  agents: ConsoleAgentRegistryEntry[];
}

/**
 * `city agent list --running` 输出可复用的运行态视图。
 */
export interface ConsoleAgentProcessView {
  /**
   * agent 项目根目录绝对路径。
   */
  projectRoot: string;

  /**
   * registry 中登记的 pid。
   */
  registeredPid: number;

  /**
   * 当前实际存活的 daemon pid。
   */
  daemonPid: number;

  /**
   * 当前是否运行中。
   */
  running: boolean;

  /**
   * 首次启动时间（ISO8601）。
   */
  startedAt: string;

  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * daemon 日志文件路径。
   */
  logPath: string;
}
