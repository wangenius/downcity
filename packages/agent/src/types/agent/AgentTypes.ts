/**
 * Agent 对外类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 `Agent` / `RemoteAgent` / `Session` 面向外部调用方的稳定接口。
 * - 宿主通过显式 `tools` / `plugins` 装配能力，不直接依赖内部 runtime 单例。
 * - 本地/远程 session 运行与基础落盘能力仍是 Agent 对外主路径。
 */

import type { LanguageModel, Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentModel } from "@/model/CityModelAdapter.js";
import type { RpcServerInstance } from "@/rpc/Server.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";

export type { AgentModel } from "@/model/CityModelAdapter.js";

/**
 * 本地 Agent 构造参数。
 */
export interface AgentOptions {
  /**
   * 当前 agent 的稳定标识。
   *
   * 关键点（中文）
   * - 用于 `.downcity/agents/<agentId>/...` 目录分区。
   * - 应保持稳定、可 URL 编码、尽量不要依赖展示名称。
   */
  id: string;

  /**
   * 当前 agent 绑定的项目根目录。
   */
  path: string;

  /**
   * 当前 agent 默认可用的工具集合。
   *
   * 关键点（中文）
   * - tools 归属于 agent 级，而不是 session 级。
   * - session 运行时会直接复用这份工具集合。
   */
  tools?: Record<string, Tool>;

  /**
   * 调用方显式传入的静态基础指令。
   *
   * 关键点（中文）
   * - `instruction` 是稳定、缓存友好的 system 前缀，不做动态变量替换。
   * - SDK 不主动读取 `PROFILE.md` / `SOUL.md`；这类项目文件应由 city 或调用方读取后传入。
   * - 未传入时，SDK 会使用包内最小 core instruction 作为 fallback。
   */
  instruction?: string | string[];

  /**
   * 当前 agent 为新建 session 提供的默认模型实例。
   *
   * 关键点（中文）
   * - SDK 仍不负责“选择哪个模型”，这里只接收宿主已经创建好的模型实例。
   * - 支持 AI SDK `LanguageModel`，也支持 City City 返回的 `CityModel`。
   * - 该模型会作为 session 首次执行前的默认注入值。
   */
  model?: AgentModel;

  /**
   * 当前 agent 显式持有的插件实例集合。
   *
   * 关键点（中文）
   * - 这里接收已经实例化好的 `BasePlugin` 对象，而不是 plugin class。
   * - `Agent` 会在构造阶段按名称注册这些实例，并自动绑定到当前 runtime。
   * - 同名 plugin 会直接报错，避免 action / hook / resolve 行为被静默覆盖。
   * - SDK 不再自动注入任何 built-in plugin；需要的能力都应由宿主显式传入。
   */
  plugins?: BasePlugin[];

  /**
   * 当前 agent 的显式环境变量覆盖项。
   *
   * 关键点（中文）
   * - 这里表示宿主显式注入给 agent 的基础 env。
   * - `Agent` 会在这份基础 env 之上继续叠加项目 `.env`。
   * - 覆盖后的最终 env 会参与配置解析与运行时上下文装配，但不会回写到宿主环境。
   */
  env?: Record<string, string>;

}

/**
 * Agent 启动参数。
 */
export interface AgentStartOptions {
  /**
   * 是否启动本机 RPC 服务。
   *
   * 关键点（中文）
   * - `false` 表示不启动。
   * - 传对象时会按给定 host/port 启动。
   * - 省略时默认不启动，避免 SDK 本地嵌入场景误开端口。
   */
  rpc?: false | AgentRpcStartOptions;

  /**
   * 是否启动当前 agent 的 plugins。
   *
   * 关键点（中文）
   * - 默认 `true`。
   * - `false` 适合只需要 session 能力、不希望启动后台能力的嵌入场景。
   */
  plugins?: boolean;
}

/**
 * Agent 停止结果快照。
 */
export interface AgentStopResult {
  /**
   * 本次是否实际停止了本机 RPC 服务。
   */
  rpcStopped: boolean;

  /**
   * 本次是否实际停止了 plugins。
   */
  pluginsStopped: boolean;
}

/**
 * Agent 启动后的状态快照。
 */
export interface AgentStartResult {
  /**
   * 当前 agent 是否已启动本机 RPC 服务。
   */
  rpc?: AgentRpcBinding;

  /**
   * 当前 agent 是否已启动 plugins。
   */
  pluginsStarted: boolean;
}

/**
 * Agent RPC 启动参数。
 */
export interface AgentRpcStartOptions {
  /**
   * RPC 监听主机。
   */
  host?: string;

  /**
   * RPC 监听端口。
   */
  port?: number;
}

/**
 * Agent RPC 绑定信息。
 */
export interface AgentRpcBinding {
  /**
   * 远程访问地址。
   */
  url: string;

  /**
   * 当前 host。
   */
  host: string;

  /**
   * 当前 port。
   */
  port: number;

  /**
   * RPC server 句柄。
   */
  server: RpcServerInstance;
}

/**
 * 远程 Agent 构造参数。
 */
export interface RemoteAgentOptions {
  /**
   * 远程 agent 访问地址。
   *
   * 例如：`https://city.example.com`、`http://127.0.0.1:15314`
   * 或 `rpc://127.0.0.1:5314`
   */
  url: string;
}

/**
 * 新建 session 的输入参数。
 */
export interface AgentCreateSessionInput {
  /**
   * 可选显式 sessionId。
   *
   * 关键点（中文）
   * - 传入时表达“创建意图”。
   * - 若该 session 已存在，SDK 应直接报错，而不是静默复用。
   * - 省略时由 SDK 自动生成稳定且不可推导的 sessionId。
   */
  sessionId?: string;
}

/**
 * Session 列表查询输入。
 */
export interface AgentListSessionsInput {
  /**
   * 当前页返回上限。
   *
   * 说明（中文）
   * - 省略时由 SDK 使用默认值。
   * - 建议宿主 UI 明确传入，避免在大量 session 下拉取过多数据。
   */
  limit?: number;

  /**
   * 分页游标。
   *
   * 说明（中文）
   * - 当前使用 SDK 自身生成的透明字符串游标。
   * - 调用方只负责透传，不应自行解析其内部格式。
   */
  cursor?: string;

  /**
   * 关键词过滤。
   *
   * 说明（中文）
   * - 推荐用于匹配 `sessionId`、标题与预览文本。
   * - 属于轻量包含匹配，不承诺复杂搜索语义。
   */
  query?: string;
}

/**
 * Session 可变配置。
 */
export interface AgentSessionSetInput {
  /**
   * 当前 session 默认模型实例。
   *
   * 关键点（中文）
   * - 这里接受运行中的模型实例，而不是模型 ID。
   * - 由于模型实例通常不可序列化，落盘只保留轻量可读标签用于展示。
   */
  model?: AgentModel;
}

/**
 * Session 当前配置快照。
 */
export interface AgentSessionConfigSnapshot {
  /**
   * 当前 session 绑定的默认模型实例。
   */
  model?: LanguageModel;

  /**
   * 当前模型的轻量可读标签。
   */
  modelLabel?: string;
}

/**
 * Session 历史视图类型。
 */
export type AgentSessionHistoryView = "message" | "timeline";

/**
 * Session 时间线事件。
 */
export interface AgentSessionTimelineEvent {
  /**
   * 当前事件唯一标识。
   */
  id: string;

  /**
   * 当前事件角色。
   *
   * 说明（中文）
   * - `tool-call` / `tool-result` 用于把 assistant 内部工具过程平铺给 UI。
   */
  role: "user" | "assistant" | "tool-call" | "tool-result";

  /**
   * 事件时间戳（毫秒）。
   */
  ts?: number;

  /**
   * 事件所属消息种类。
   */
  kind?: string;

  /**
   * 事件来源。
   */
  source?: string;

  /**
   * 当前事件展示文本。
   */
  text: string;

  /**
   * 当前事件对应工具名称。
   *
   * 说明（中文）
   * - 仅 `tool-call` / `tool-result` 这类事件通常会携带该字段。
   */
  toolName?: string;
}

/**
 * Session system block 来源类型。
 */
export type AgentSessionSystemBlockSource =
  | "core"
  | "instruction"
  | "plugin"
  | "session";

/**
 * Session system prompt 的单个组成块。
 */
export interface AgentSessionSystemBlock {
  /**
   * 当前 block 的来源层级。
   */
  source: AgentSessionSystemBlockSource;

  /**
   * 当前 block 在来源层级内的名称。
   *
   * 说明（中文）
   * - `instruction` 通常使用 `agent`。
   * - `plugin` 使用对应 plugin 名称。
   * - `core` 使用 `default`。
   * - `session` 使用当前 session 上下文名称。
   */
  name: string;

  /**
   * 已归一化后的 system 文本内容。
   *
   * 关键点（中文）
   * - SDK 不对 instruction 做动态变量替换。
   * - 动态上下文应由调用方放入 user message。
   */
  content: string;
}

/**
 * 当前 session 的稳定上下文信息。
 */
export interface AgentSessionSystemSessionInfo {
  /**
   * 当前 session 所属 agentId。
   */
  agentId: string;

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;

  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 session 首次创建时间。
   *
   * 关键点（中文）
   * - 这是 session 初始化时落盘的稳定参考时间，按 Date/ISO 字符串对外展示。
   * - 它不是每轮运行的当前时间，不会随着后续 turn 执行而改变。
   */
  createdAt: string;

  /**
   * 当前 session 初始化时解析到的系统时区。
   *
   * 关键点（中文）
   * - 这是 session 级参考时区，随创建信息一起固定。
   * - 它不是每轮运行重新解析的动态时区。
   */
  timezone: string;
}

/**
 * 当前 session 生效的完整 system prompt 快照。
 */
export interface AgentSessionSystemSnapshot {
  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 当前 session 的稳定上下文信息。
   *
   * 关键点（中文）
   * - 这里包含 session 创建时间这类稳定参考信息。
   * - 这里不包含当前时间、轮次、用户输入等每轮变化的数据。
   * - 每轮动态信息应由调用方放入 user message，避免破坏 instruction 缓存命中。
   */
  session: AgentSessionSystemSessionInfo;

  /**
   * 当前生效的 system blocks，按进入模型的顺序排列。
   */
  blocks: AgentSessionSystemBlock[];
}

/**
 * Session 摘要。
 */
export interface AgentSessionSummary {
  /**
   * 当前 session 所属 agentId。
   */
  agentId: string;

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;

  /**
   * 当前 session 可读标题。
   *
   * 说明（中文）
   * - 标题持久化在 session `meta.json` 顶层。
   * - 首条用户消息出现后，SDK 会优先生成标题，失败时回退到首条用户消息截断。
   * - 空 session 可能暂时没有标题，调用方可回退到 `sessionId`。
   */
  title?: string;

  /**
   * 当前 session 的最近预览文本。
   *
   * 说明（中文）
   * - 通常来自最后一条用户可见消息的裁剪文本。
   * - 适合用于侧边栏、列表卡片或 session picker。
   */
  previewText?: string;

  /**
   * 当前 session 首次创建时间（ms）。
   */
  createdAt?: number;

  /**
   * 当前 session 最近一次更新时间（ms）。
   */
  updatedAt?: number;

  /**
   * 当前 session 已落盘消息数。
   */
  messageCount: number;

  /**
   * 当前 session 绑定模型的可读标签。
   */
  modelLabel?: string;

  /**
   * 当前 session 是否处于执行中。
   */
  executing?: boolean;
}

/**
 * Session 详情。
 */
export interface AgentSessionInfo extends AgentSessionSummary {
  /**
   * 当前 session 初始化时记录的时区。
   */
  timezone?: string;
}

/**
 * Session 摘要分页结果。
 */
export interface AgentSessionSummaryPage {
  /**
   * 当前页 session 摘要列表。
   */
  items: AgentSessionSummary[];

  /**
   * 当前页所对应的总条数。
   *
   * 说明（中文）
   * - 这里表示过滤后的总数，不是仅当前页数量。
   * - 对分页 UI、结果统计和空态判断更友好。
   */
  total: number;

  /**
   * 下一页游标。
   */
  nextCursor?: string;

  /**
   * 是否仍有更多结果。
   */
  hasMore: boolean;
}

/**
 * Session 历史读取输入。
 */
export interface AgentSessionHistoryInput {
  /**
   * 当前页返回上限。
   */
  limit?: number;

  /**
   * 分页游标。
   */
  cursor?: string;

  /**
   * 返回顺序。
   *
   * 说明（中文）
   * - `asc`：从旧到新
   * - `desc`：从新到旧
   */
  order?: "asc" | "desc";

  /**
   * 返回视图类型。
   *
   * 说明（中文）
   * - `message`：原始 session 消息
   * - `timeline`：适合直接渲染 UI 的平铺事件
   */
  view?: AgentSessionHistoryView;
}

/**
 * Session 历史分页结果。
 */
export interface AgentSessionHistoryPage {
  /**
   * 当前读取所对应的 session 信息。
   */
  session: AgentSessionInfo;

  /**
   * 当前页实际返回视图。
   */
  view: AgentSessionHistoryView;

  /**
   * 当前页数据列表。
   *
   * 说明（中文）
   * - `view=message` 时返回 `SessionMessageV1[]`
   * - `view=timeline` 时返回 `AgentSessionTimelineEvent[]`
   */
  items: SessionMessageV1[] | AgentSessionTimelineEvent[];

  /**
   * 过滤前后的总条数。
   *
   * 说明（中文）
   * - 对 `view=message` 表示消息条数。
   * - 对 `view=timeline` 表示时间线事件条数。
   */
  total: number;

  /**
   * 下一页游标。
   */
  nextCursor?: string;

  /**
   * 是否仍有更多数据。
   */
  hasMore: boolean;
}

/**
 * Session fork 输入。
 */
export interface AgentSessionForkInput {
  /**
   * 可选分叉锚点消息 ID。
   *
   * 关键点（中文）
   * - 省略时复制当前 session 的完整消息历史。
   * - 传入时复制到该消息为止（包含该消息）。
   */
  messageId?: string;
}

/**
 * SDK Session 集合绑定。
 */
export interface AgentSessionCollection {
  /**
   * 新建一个 session。
   */
  createSession(input?: AgentCreateSessionInput): Promise<AgentSession>;

  /**
   * 获取一个已存在的 session。
   */
  getSession(sessionId: string): Promise<AgentSession>;

  /**
   * 列出当前 agent 的 session 摘要页。
   */
  listSessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage>;
}

/**
 * Session actor 公共能力。
 */
export interface AgentSessionActor {
  /**
   * 当前 session 稳定标识。
   */
  readonly id: string;

  /**
   * 读取当前 session 详情。
   */
  getInfo(): Promise<AgentSessionInfo>;

  /**
   * 追加一条新的 prompt。
   */
  prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle>;

  /**
   * 订阅当前 session 的未来事件。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe;

  /**
   * 读取当前 session 历史分页。
   */
  history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage>;

  /**
   * 读取当前 session 生效的 system 快照。
   */
  system(): Promise<AgentSessionSystemSnapshot>;
}

/**
 * 本地 Agent 返回的公开 session 接口。
 */
export interface AgentSession extends AgentSessionActor {
  /**
   * 当前 session 所属 agentId。
   */
  readonly agentId: string;

  /**
   * 当前 session 配置快照。
   */
  readonly config: AgentSessionConfigSnapshot;

  /**
   * 写入当前 session 默认配置。
   */
  set(input: AgentSessionSetInput): Promise<void>;

  /**
   * 从当前 session 创建一个分叉会话。
   */
  fork(input?: AgentSessionForkInput | string): Promise<AgentSession>;
}

/**
 * 远程 Agent 返回的公开 session 接口。
 */
export interface RemoteAgentSession extends AgentSessionActor {
  /**
   * 从当前远程 session 创建一个分叉会话。
   */
  fork(input?: AgentSessionForkInput | string): Promise<RemoteAgentSession>;
}
