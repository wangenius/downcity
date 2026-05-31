/**
 * Console Dashboard 概览、配置与会话摘要类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

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
   * 当前选中的 agent 项目 id。
   */
  selectedAgentProjectId?: string;
  /**
   * 配置文件状态列表。
   */
  items?: UiConfigStatusItem[];
}

/**
 * Context 概览项。
 */
export interface UiOverviewSessionItem {
  /**
   * Session 唯一标识。
   */
  sessionId?: string;
}

/**
 * Dashboard session 摘要项。
 */
export interface UiSessionSummary {
  /**
   * session 唯一标识。
   */
  sessionId: string;
  /**
   * session 关联的渠道名称（例如 `telegram` / `qq` / `feishu` / `consoleui`）。
   * - 由后端按 `sessionId -> channel` 映射解析后回传。
   * - 当历史数据缺失映射时可能为空，前端需自行回退解析。
   */
  channel?: string;
  /**
   * 该 session 对应的渠道侧会话标识（如 telegram chat id / qq openid）。
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
  /**
   * 当前 session 是否正在执行。
   */
  executing?: boolean;
}

/**
 * `/api/dashboard/sessions` 响应。
 */
export interface UiSessionsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context 列表。
   */
  sessions?: UiSessionSummary[];
}

/**
 * `/api/dashboard/overview` 响应。
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
  sessions?: {
    /**
     * context 总数。
     */
    total?: number;
    /**
     * context 列表。
     */
    items?: UiOverviewSessionItem[];
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
