/**
 * Agent 本地实例配置与生命周期类型。
 *
 * 关键点（中文）
 * - 只描述本地 Agent 的构造、启动、停止与 RPC 绑定。
 * - RemoteAgent 与 Session 数据结构拆到独立类型文件。
 */

import type { Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentModel } from "@/model/CityModelAdapter.js";
import type { RpcServerInstance } from "@/rpc/Server.js";

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

  /** 当前 agent 绑定的项目根目录。 */
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
  /** 本次是否实际停止了本机 RPC 服务。 */
  rpcStopped: boolean;
  /** 本次是否实际停止了 plugins。 */
  pluginsStopped: boolean;
}

/**
 * Agent 启动后的状态快照。
 */
export interface AgentStartResult {
  /** 当前 agent 是否已启动本机 RPC 服务。 */
  rpc?: AgentRpcBinding;
  /** 当前 agent 是否已启动 plugins。 */
  pluginsStarted: boolean;
}

/**
 * Agent RPC 启动参数。
 */
export interface AgentRpcStartOptions {
  /** RPC 监听主机。 */
  host?: string;
  /** RPC 监听端口。 */
  port?: number;
}

/**
 * Agent RPC 绑定信息。
 */
export interface AgentRpcBinding {
  /** 远程访问地址。 */
  url: string;
  /** 当前 host。 */
  host: string;
  /** 当前 port。 */
  port: number;
  /** RPC server 句柄。 */
  server: RpcServerInstance;
}
