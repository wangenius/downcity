/**
 * Console UI 相关类型定义。
 *
 * 关键点（中文）
 * - UI 由 console 独立提供，不和单个 agent 进程绑定。
 * - 同一个 UI 进程可切换查看多个已登记的 agent runtime。
 */

/**
 * Console UI 中单个 agent 选项。
 */
export interface ConsoleUiAgentOption {
  /**
   * UI 侧唯一标识（使用 projectRoot 绝对路径）。
   */
  id: string;

  /**
   * agent 显示名称（优先 ship.json.name，回退目录名）。
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
   * 当前 agent 的 `ship.json.model.primary`。
   */
  primaryModelId?: string;
}

/**
 * `/api/ui/agents` 响应体。
 */
export interface ConsoleUiAgentsResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 当前 SMA CLI 版本号。
   */
  smaVersion: string;

  /**
   * 当前可选的 agent 列表。
   */
  agents: ConsoleUiAgentOption[];

  /**
   * 当前选中的 agent id（无可用 agent 时为空字符串）。
   */
  selectedAgentId: string;
}

/**
 * Console UI 后台进程元数据。
 */
export interface ConsoleUiRuntimeMeta {
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
 * Console UI 运行状态视图。
 */
export interface ConsoleUiRuntimeStatus {
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
export interface ConsoleUiConfigFileStatusItem {
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
export interface ConsoleUiConfigStatusResponse {
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
  items: ConsoleUiConfigFileStatusItem[];
}
