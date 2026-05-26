/**
 * Agent SDK 对外类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 `Agent` / `RemoteAgent` / `Session` 面向外部调用方的稳定接口。
 * - SDK 用户通过显式 `tools` / `plugins` 装配能力，不直接依赖内部 runtime 单例。
 * - 本地/远程 session 运行与基础落盘能力仍是 SDK 主路径。
 */

import type { LanguageModel, Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentPlatformRuntime } from "@/types/runtime/host/AgentHost.js";
import type { LocalRpcServerHandle } from "@/types/runtime/rpc/LocalRpc.js";
import type { ServerInstance } from "@/runtime/server/http/Server.js";
import type { Session } from "@/sdk/Session.js";

/**
 * SDK Agent 插件装配模式。
 */
export type AgentMode = "preset" | "custom";

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
   * - SDK 仍不负责“选择哪个模型”，这里只接收宿主已经创建好的 `LanguageModel`。
   * - 该模型会作为 session 首次执行前的默认注入值。
   * - 若同时提供 `configureSession`，则先应用这里的默认模型，再允许宿主继续覆写。
   */
  model?: LanguageModel;

  /**
   * 当前 agent 的插件装配模式。
   *
   * 关键点（中文）
   * - `preset` 会自动装配内建插件集合。
   * - `custom` 只使用显式传入的 `plugins`。
   * - 默认值为 `custom`，避免本地嵌入场景隐式打开额外能力。
   */
  mode?: AgentMode;

  /**
   * 当前 agent 显式持有的插件实例集合。
   *
   * 关键点（中文）
   * - 这里接收已经实例化好的 `BasePlugin` 对象，而不是 plugin class。
   * - `Agent` 会在构造阶段按名称注册这些实例，并自动绑定到当前 runtime。
   * - 同名 plugin 会直接报错，避免 action / hook / resolve 行为被静默覆盖。
   */
  plugins?: BasePlugin[];

  /**
   * 当前 agent 显式注入的平台能力集合。
   *
   * 关键点（中文）
   * - SDK 侧若不提供，则使用最小空实现。
   * - 推荐由宿主产品显式传入，避免 SDK 本地实例隐式依赖 city。
   */
  platform?: AgentPlatformRuntime;

  /**
   * 在 session 初始化后执行的宿主配置钩子。
   *
   * 关键点（中文）
   * - SDK 不负责默认模型策略，宿主可在这里统一为 session 注入 model 等运行配置。
   * - 若同时传入 `model`，则会先写入默认模型，再执行这里的宿主覆写逻辑。
   * - 该钩子对每个 session 只触发一次，适合做实例级默认装配。
   * - 触发时机可能来自显式 `agent.session()`，也可能来自该 session 的首次执行入口。
   */
  configureSession?: (session: Session) => Promise<void> | void;
}

/**
 * Agent 启动参数。
 */
export interface AgentStartOptions {
  /**
   * 是否启动 HTTP 服务。
   *
   * 关键点（中文）
   * - `false` 表示不启动。
   * - 传对象时会按给定 host/port 启动。
   * - 省略时默认不启动，避免 SDK 本地嵌入场景误开端口。
   */
  http?: false | AgentHttpStartOptions;

  /**
   * 是否启动本地 RPC 服务。
   *
   * 关键点（中文）
   * - `true` 时启动主 local RPC server。
   * - 省略或 `false` 时不启动。
   */
  rpc?: boolean;

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
   * 本次是否实际停止了 HTTP 服务。
   */
  httpStopped: boolean;

  /**
   * 本次是否实际停止了本地 RPC 服务。
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
   * 当前 agent 是否已启动 HTTP 服务。
   */
  http?: AgentHttpBinding;

  /**
   * 当前 agent 是否已启动本地 RPC 服务。
   */
  rpc?: AgentRpcBinding;

  /**
   * 当前 agent 是否已启动 plugins。
   */
  pluginsStarted: boolean;
}

/**
 * Agent HTTP 启动参数。
 */
export interface AgentHttpStartOptions {
  /**
   * HTTP 监听主机。
   */
  host?: string;

  /**
   * HTTP 监听端口。
   */
  port?: number;
}

/**
 * Agent HTTP 绑定信息。
 */
export interface AgentHttpBinding {
  /**
   * 对外访问地址。
   */
  baseUrl: string;

  /**
   * 当前 host。
   */
  host: string;

  /**
   * 当前 port。
   */
  port: number;

  /**
   * HTTP server 句柄。
   */
  server: ServerInstance;
}

/**
 * Agent RPC 绑定信息。
 */
export interface AgentRpcBinding {
  /**
   * 当前本地 RPC endpoint。
   */
  endpoint: string;

  /**
   * 本地 RPC server 句柄。
   */
  server: LocalRpcServerHandle;
}

/**
 * 远程 Agent 构造参数。
 */
export interface RemoteAgentOptions {
  /**
   * 远程 SDK HTTP 基础地址。
   *
   * 例如：`http://127.0.0.1:15314`
   */
  baseUrl: string;
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
  model?: LanguageModel;
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
 * Session 元数据列表项。
 */
export interface AgentSessionMetadata {
  /**
   * 当前 session 所属 agentId。
   */
  agentId: string;

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;

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
