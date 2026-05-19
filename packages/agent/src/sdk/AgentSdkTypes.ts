/**
 * Agent SDK 对外类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 `Agent` / `RemoteAgent` / `Session` 面向外部调用方的稳定接口。
 * - SDK 用户通过显式 `tools` / `services` / `plugins` 装配能力，不直接依赖内部 runtime 单例。
 * - 本地/远程 session 运行与基础落盘能力仍是 SDK 主路径。
 */

import type { LanguageModel, Tool } from "ai";
import type { BaseService } from "@/service/builtins/BaseService.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { Plugin } from "@/plugin/types/Plugin.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { AgentPlatformRuntime } from "@/types/host/AgentHost.js";

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
   * 当前 agent 显式持有的 service 实例集合。
   *
   * 关键点（中文）
   * - 这里接收已经实例化好的 service，而不是 service class。
   * - `Agent` 会在构造阶段按名称注册这些实例，并在启动时自动绑定 runtime。
   * - v1 推荐显式传入 `new ChatService(...)` 这类实例，而不是依赖包内隐式注册表。
   */
  services?: BaseService[];

  /**
   * 当前 agent 显式注册的 plugin 定义集合。
   *
   * 关键点（中文）
   * - 这里接收完整 plugin 定义对象，而不是 plugin 名称。
   * - `Agent` 会为当前 SDK 实例创建独立 plugin registry，避免污染全局 runtime。
   * - 同名 plugin 会直接报错，避免 action / hook / resolve 行为被静默覆盖。
   */
  plugins?: Plugin[];

  /**
   * 当前 agent 显式注入的平台能力集合。
   *
   * 关键点（中文）
   * - SDK 侧若不提供，则使用最小空实现。
   * - 推荐由宿主产品显式传入，避免 SDK 本地实例隐式依赖 city。
   */
  platform?: AgentPlatformRuntime;
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
 * Session 运行输入。
 */
export interface AgentSessionRunInput {
  /**
   * 当前轮用户查询文本。
   */
  query: string;
}

/**
 * Session 运行结果。
 */
export interface AgentSessionRunResult {
  /**
   * 本轮执行是否成功。
   */
  success: boolean;

  /**
   * 失败时的错误文本。
   */
  error?: string;

  /**
   * 最终 assistant 文本。
   */
  text: string;

  /**
   * 最终 assistant 原始 UIMessage。
   */
  assistantMessage: SessionMessageV1;
}

/**
 * SDK 对外的流式事件。
 */
export type AgentSessionStreamEvent =
  | {
      /**
       * 文本增量事件。
       */
      type: "text-delta";
      /**
       * 当前追加的文本片段。
       */
      text: string;
    }
  | {
      /**
       * reasoning 增量事件。
       */
      type: "reasoning-delta";
      /**
       * 当前追加的 reasoning 文本片段。
       */
      text: string;
    }
  | {
      /**
       * 工具调用可用事件。
       */
      type: "tool-call";
      /**
       * 当前工具调用唯一标识。
       */
      toolCallId: string;
      /**
       * 工具名称。
       */
      toolName: string;
      /**
       * 工具输入参数。
       */
      args: JsonValue;
    }
  | {
      /**
       * 工具调用结果事件。
       */
      type: "tool-result";
      /**
       * 当前工具调用唯一标识。
       */
      toolCallId: string;
      /**
       * 工具名称。
       */
      toolName: string;
      /**
       * 工具输出结果。
       */
      result: JsonValue;
    }
  | {
      /**
       * 工具调用失败事件。
       */
      type: "tool-error";
      /**
       * 当前工具调用唯一标识。
       */
      toolCallId: string;
      /**
       * 工具名称。
       */
      toolName: string;
      /**
       * 错误文本。
       */
      error: string;
    }
  | {
      /**
       * 运行结束事件。
       */
      type: "finish";
      /**
       * 最终完成原因（若底层可提供）。
       */
      finishReason?: string;
    }
  | {
      /**
       * 运行错误事件。
       */
      type: "error";
      /**
       * 错误文本。
       */
      error: string;
    };

/**
 * Session system block 来源类型。
 */
export type AgentSessionSystemBlockSource =
  | "core"
  | "instruction"
  | "service"
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
   * - `service` / `plugin` 使用对应 service/plugin 名称。
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
   * - 它不是每轮运行的当前时间，不会随着 `run()` / `stream()` 改变。
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
