/**
 * Chrome 扩展内部领域类型。
 *
 * 关键点（中文）：
 * - 扩展当前保留 Popup / Options / Side Panel 三个入口。
 * - 用户配置围绕「Server Connection -> Agent -> 路由目标」三层关系组织。
 * - 所有用户可见配置都集中定义在这里，避免 UI / storage 各自维护字段。
 */

/**
 * Server Connection 协议。
 */
export type ExtensionServerProtocol = "http" | "https";

/**
 * Server Connection 配置。
 */
export interface ExtensionServerConnection {
  /**
   * 本地生成的稳定连接 id。
   */
  id: string;

  /**
   * 连接显示名称。
   */
  name: string;

  /**
   * 目标 Server 主机名或 IP。
   */
  host: string;

  /**
   * 目标 Server 使用的传输协议。
   */
  protocol: ExtensionServerProtocol;

  /**
   * 目标 Server 端口。
   */
  port: number;

  /**
   * 目标 Server 的可选基础路径。
   *
   * 例如：
   * - 空字符串：`/`
   * - `/downcity`
   * - `/console/api`
   */
  basePath: string;
}

/**
 * 单个连接的本地密钥配置。
 */
export interface ExtensionServerConnectionSecret {
  /**
   * 该连接对应的 Bearer Token 明文。
   */
  token: string;
}

/**
 * 所有连接的本地密钥映射。
 */
export interface ExtensionServerConnectionSecretMap {
  /**
   * 以连接 id 为 key 的本地敏感配置。
   */
  [connectionId: string]: ExtensionServerConnectionSecret | undefined;
}

/**
 * 扩展消息投递目标模式。
 */
export type ExtensionRouteTargetMode = "agent_session" | "im_forward";

/**
 * 单个连接的默认路由偏好。
 */
export interface ExtensionConnectionRoutePreference {
  /**
   * 当前连接默认投递目标。
   *
   * 说明（中文）：
   * - `agent_session`：直连 Agent SDK session，作为浏览器侧常驻对话。
   * - `im_forward`：转发到 ChatPlugin 维护的 IM 平台 session。
   */
  targetMode: ExtensionRouteTargetMode;

  /**
   * 该连接默认使用的 Agent id。
   */
  agentId: string;

  /**
   * 该连接默认使用的 IM Session id。
   *
   * 说明（中文）：
   * - 仅在 `targetMode === "im_forward"` 时使用。
   * - 由 Telegram / Feishu / QQ 等 ChatPlugin 渠道产生。
   */
  sessionId: string;

  /**
   * 该连接默认使用的 Agent SDK Session id。
   *
   * 说明（中文）：
   * - 仅在 `targetMode === "agent_session"` 时使用。
   * - 若为空，扩展会按连接与 Agent 自动生成稳定 id。
   */
  agentSessionId: string;
}

/**
 * 扩展设置。
 */
export interface ExtensionSettings {
  /**
   * 已保存的 Server Connection 列表。
   */
  connections: ExtensionServerConnection[];

  /**
   * 当前选中的连接 id。
   */
  selectedConnectionId: string;

  /**
   * 各连接独立的默认 Agent / Session 路由偏好。
   */
  routePreferences: Record<string, ExtensionConnectionRoutePreference | undefined>;

  /**
   * 用户补充任务说明。
   */
  taskPrompt: string;
}

/**
 * 当前活动标签页信息。
 */
export interface ActiveTabContext {
  /**
   * 标签页 id。
   */
  tabId: number | null;

  /**
   * 页面标题。
   */
  title: string;

  /**
   * 页面地址。
   */
  url: string;
}

/**
 * 页面 Markdown 快照。
 */
export interface PageMarkdownSnapshot {
  /**
   * 文档标题（用于 Markdown 一级标题）。
   */
  title: string;

  /**
   * 页面链接（用于元信息记录）。
   */
  url: string;

  /**
   * 生成后的 Markdown 正文。
   */
  markdown: string;

  /**
   * 建议附件文件名（例如 `some-page.md`）。
   */
  fileName: string;
}

/**
 * Popup 状态消息。
 */
export interface StatusMessage {
  /**
   * 消息级别。
   */
  type: "idle" | "loading" | "success" | "error";

  /**
   * 展示给用户的主消息。
   */
  text: string;
}

/**
 * 当前页面发送记录。
 */
export interface ExtensionPageSendRecord {
  /**
   * 记录唯一 id（本地生成）。
   */
  id: string;

  /**
   * 所属 Server Connection id。
   */
  connectionId: string;

  /**
   * 页面 URL（标准化后，用于当前页面筛选）。
   */
  pageUrl: string;

  /**
   * 发送时页面标题快照。
   */
  pageTitle: string;

  /**
   * 发送目标 Agent id。
   */
  agentId: string;

  /**
   * 发送目标 Session id。
   */
  sessionId: string;

  /**
   * 用户输入的任务说明快照。
   */
  taskPrompt: string;

  /**
   * 发送时附件文件名。
   */
  attachmentFileName: string;

  /**
   * 发送时间戳（毫秒）。
   */
  sentAt: number;
}
