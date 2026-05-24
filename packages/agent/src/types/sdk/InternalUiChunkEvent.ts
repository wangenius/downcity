/**
 * SDK 内部 UI chunk 事件类型定义。
 *
 * 关键点（中文）
 * - 这是 Session 事件映射器的内部中间态，不从包根入口导出。
 * - 它只负责承接底层 AI SDK `UIMessageChunk`，再转成 `AgentSessionEvent`。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * SDK 内部 UI chunk 事件。
 */
export type InternalUiChunkEvent =
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
