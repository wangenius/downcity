/**
 * Agent SDK 对外类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 `Agent` / `RemoteAgent` / `Session` 面向外部调用方的稳定接口。
 * - 不把内部 `AgentRuntime`、`AgentContext`、service/plugin 管理细节暴露给 SDK 用户。
 * - v1 先聚焦本地/远程 session 运行与基础落盘能力。
 */

import type { LanguageModel, Tool } from "ai";
import type { JsonValue } from "@/shared/types/Json.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";

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
