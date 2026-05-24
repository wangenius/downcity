/**
 * Agent UI chunk 事件类型定义。
 *
 * 关键点（中文）
 * - 这是内部传输/映射层事件，不是 Session 的公开订阅事件。
 * - 它用于把底层 AI SDK `UIMessageChunk` 归一化，再按不同宿主场景转成最终输出。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * 内部 UI chunk 事件。
 */
export type AgentUiChunkEvent =
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
