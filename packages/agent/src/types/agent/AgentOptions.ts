/**
 * Agent 本地实例配置与生命周期类型。
 *
 * 关键点（中文）
 * - 只描述本地 Agent 的构造、启动、停止与 RPC 绑定。
 * - RemoteAgent 与 Session 数据结构拆到独立类型文件。
 */

import type { Tool } from "ai";
import type { Shell } from "@downcity/shell";
import type { Plugin } from "@/types/plugin/PluginDefinition.js";
import type { AgentModel } from "@/model/CityModelAdapter.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type {
  AgentManagedSession,
  SessionOptions,
} from "@/types/session/SessionOptions.js";

/**
 * Agent 可使用的 Session 类。
 *
 * 关键点（中文）
 * - 传 class，而不是传实例，保证 Agent 可以按 sessionId 创建多个 session。
 * - 自定义类可继承默认 `Session`，并在构造函数里注入自己的 Composer。
 */
export type AgentSessionConstructor = new (
  options: SessionOptions,
) => AgentManagedSession;

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
   * 当前 agent 内建 shell 能力。
   *
   * 关键点（中文）
   * - Shell 不是 plugin，而是 agent 直接挂载的内建工具对象。
   * - 未传入时，Agent 不会自动注入 shell tools。
   */
  shell?: Shell;

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
   * - 这里接收已经创建好的 `Plugin` 对象，而不是 plugin class。
   * - `Agent` 会在构造阶段按名称注册这些实例，并自动绑定到当前 runtime。
   * - 同名 plugin 会直接报错，避免 action / hook / resolve 行为被静默覆盖。
   * - SDK 不再自动注入任何 built-in plugin；需要的能力都应由宿主显式传入。
   */
  plugins?: Plugin[];

  /**
   * 当前 agent 使用的本地 Session 类。
   *
   * 关键点（中文）
   * - Agent 只负责用这个类创建/恢复 session，不感知具体 Composer 策略。
   * - 如果需要自定义 Composer，请在自定义 Session 类内部传给 `super({ composers })`。
   * - 该能力仅适用于本地 `Agent`。
   */
  Session?: AgentSessionConstructor;

  /**
   * 当前 agent 的显式环境变量覆盖项。
   *
   * 关键点（中文）
   * - 这里表示宿主显式注入给 agent 的基础 env。
   * - `Agent` 会在这份基础 env 之上继续叠加项目 `.env`。
   * - 覆盖后的最终 env 会参与配置解析与运行时上下文装配，但不会回写到宿主环境。
   */
  env?: Record<string, string>;

  /**
   * 宿主显式传入的运行时配置。
   *
   * 关键点（中文）
   * - SDK 不要求项目目录存在 `downcity.json`。
   * - CLI / Console 可从自己的配置存储读取后传入这里。
   */
  config?: DowncityConfig;
}
