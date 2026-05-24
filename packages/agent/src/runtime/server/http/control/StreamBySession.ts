/**
 * Control session 增量执行 helper。
 *
 * 关键点（中文）
 * - 仅用于单 agent control API 的本地 session 增量返回。
 * - chatKey 命中的平台 chat 队列仍保持原有入队语义，不在这里伪造“流式完成”。
 * - 输出协议使用内部 `AgentUiChunkEvent` 的 NDJSON 事件行，便于 CLI 直接消费。
 */

import type { AgentContext, SessionPort } from "@/core/AgentContextTypes.js";
import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type {
  ControlSessionExecuteAttachmentInput,
} from "@/runtime/server/http/control/types/ControlSessionExecute.js";
import { buildExecuteInputText } from "@/runtime/server/http/control/Helpers.js";
import { drainDeferredPersistedUserMessages } from "@session/SessionRunScope.js";
import { mapUiMessageChunkToAgentEvent } from "@/sdk/SessionEventMapper.js";
import type { AgentUiChunkEvent } from "@/types/sdk/AgentUiChunkEvent.js";
import type {
  SessionRunResult,
  SessionUiMessageChunkCallback,
} from "@/session/types/SessionRun.js";
import { resolveDispatchTargetByChatKey } from "@/service/builtins/chat/runtime/ChatkeySend.js";
import {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "@/service/builtins/chat/runtime/UserVisibleText.js";

type StreamableSessionPort = SessionPort & {
  /**
   * 流式执行当前 session。
   *
   * 说明（中文）
   * - `SessionPort` 对外接口当前未显式暴露 `onUiMessageChunkCallback`，
   *   但本地 executor 已支持该回调，这里按本地 control runtime 语义做窄化使用。
   */
  execute(params: {
    query: string;
    onUiMessageChunkCallback?: SessionUiMessageChunkCallback;
  }): Promise<SessionRunResult>;
};

const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

function encodeNdjsonLine(
  encoder: TextEncoder,
  value: AgentUiChunkEvent,
): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function resolveStreamEventFromUiChunk(params: {
  chunk: Parameters<NonNullable<SessionUiMessageChunkCallback>>[0];
  toolNameByCallId: Map<string, string>;
}): AgentUiChunkEvent | null {
  const { chunk, toolNameByCallId } = params;
  if (chunk.type === "tool-input-start") {
    toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
    return null;
  }

  const event = mapUiMessageChunkToAgentEvent(chunk);
  if (!event) return null;

  if (event.type === "tool-call" || event.type === "tool-error") {
    toolNameByCallId.set(event.toolCallId, event.toolName);
  }

  if (
    (event.type === "tool-result" || event.type === "tool-error") &&
    event.toolName === "unknown"
  ) {
    const toolName = toolNameByCallId.get(event.toolCallId);
    return toolName ? { ...event, toolName } : event;
  }

  return event;
}

/**
 * 为指定 session 创建流式执行响应。
 */
export async function createControlSessionStreamResponse(params: {
  agentState: AgentRuntime;
  executionContext: AgentContext;
  sessionId: string;
  instructions: string;
  attachments?: ControlSessionExecuteAttachmentInput[];
}): Promise<Response> {
  const sessionId = String(params.sessionId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!sessionId) {
    return Response.json({ success: false, error: "Missing sessionId" }, { status: 400 });
  }
  if (!instructions) {
    return Response.json({ success: false, error: "Missing instructions" }, { status: 400 });
  }

  const executeInput = await buildExecuteInputText({
    projectRoot: params.agentState.rootPath,
    sessionId,
    instructions,
    attachments: params.attachments,
  });

  const dispatchTarget = await resolveDispatchTargetByChatKey({
    context: params.executionContext,
    chatKey: sessionId,
  });
  if (dispatchTarget) {
    return Response.json(
      {
        success: false,
        error:
          "Streaming execute does not support queued chat sessions. Use the non-stream execute API for chatKey routes.",
      },
      { status: 409 },
    );
  }

  const session = params.agentState.getSession(sessionId) as StreamableSessionPort;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const toolNameByCallId = new Map<string, string>();

        const pushEvent = (event: AgentUiChunkEvent): void => {
          controller.enqueue(encodeNdjsonLine(encoder, event));
        };

        try {
          await session.appendUserMessage({
            text: executeInput,
          });

          const result = await session.execute({
            query: executeInput,
            onUiMessageChunkCallback: async (chunk) => {
              const event = resolveStreamEventFromUiChunk({
                chunk,
                toolNameByCallId,
              });
              if (!event) return;
              pushEvent(event);
            },
          });

          const userVisible = pickLastSuccessfulChatSendText(
            result.assistantMessage,
          ).trim();
          try {
            const messageForPersistence = resolveAssistantMessageForPersistence(
              result.assistantMessage,
            );
            if (messageForPersistence) {
              await session.appendAssistantMessage({
                message: messageForPersistence,
                fallbackText: userVisible,
                extra: {
                  via: "tui_session_stream",
                  note: "assistant_message_missing",
                },
              });
            }
            const deferredInjectedMessages = drainDeferredPersistedUserMessages(
              sessionId,
            );
            for (const message of deferredInjectedMessages) {
              await session.appendUserMessage({
                message,
              });
            }
          } catch {
            // ignore persistence follow-up errors after stream completion
          }
        } catch (error) {
          pushEvent({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
