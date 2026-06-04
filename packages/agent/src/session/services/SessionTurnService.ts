/**
 * SessionTurnService：本地 Session turn 编排服务。
 *
 * 关键点（中文）
 * - 统一管理 prompt actor 调度、turn 执行与 Session 事件流派发。
 * - 该服务负责把 SessionPromptRuntime 与 Executor 连接起来。
 * - metadata、title、assistant 结果持久化等状态副作用交由 SessionStateService 处理。
 */

import { extractTextFromUiMessage } from "@/executor/messages/UIMessageTransformer.js";
import type { Executor } from "@executor/Executor.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type {
  SessionMessageV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionMessages.js";
import { mapAgentEventToSessionEvent, mapUiMessageChunkToAgentEvent } from "@/session/SessionEventMapper.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionPromptRuntime } from "@/session/runtime/SessionPromptRuntime.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";

type SessionTurnServiceOptions = {
  /**
   * 当前 session 标识。
   */
  session_id: string;

  /**
   * 当前 session 执行器。
   */
  executor: Executor;

  /**
   * 当前 session 状态服务。
   */
  state_service: SessionStateService;

  /**
   * 当前 session 共享事件总线。
   */
  event_hub: SessionEventHub;
};

/**
 * 本地 Session turn 编排服务。
 */
export class SessionTurnService {
  private readonly session_id: string;
  private readonly executor: Executor;
  private readonly state_service: SessionStateService;
  private readonly event_hub: SessionEventHub;
  private readonly prompt_runtime: SessionPromptRuntime;

  constructor(options: SessionTurnServiceOptions) {
    this.session_id = options.session_id;
    this.executor = options.executor;
    this.state_service = options.state_service;
    this.event_hub = options.event_hub;
    this.prompt_runtime = new SessionPromptRuntime({
      sessionId: this.session_id,
      publish: (event) => {
        this.publish_event(event);
      },
      createAndPersistUserMessage: async (input) => {
        return await this.state_service.create_and_persist_user_prompt_message(
          input,
        );
      },
      executeTurn: async ({ turnId, promptInput, onStepMerge }) => {
        return await this.execute_prompt_turn({
          turnId,
          promptInput,
          onStepMerge,
        });
      },
    });
  }

  /**
   * 发布一条 session 事件。
   */
  publish_event(event: AgentSessionEvent): void {
    this.event_hub.publish(event);
  }

  /**
   * 订阅当前 session 的未来事件。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    return this.event_hub.subscribe(subscriber);
  }

  /**
   * 判断当前 turn 调度器是否活跃。
   */
  is_prompt_runtime_active(): boolean {
    return this.prompt_runtime.isActive();
  }

  /**
   * 追加一条新的 Session prompt。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("session.prompt requires a non-empty query");
    }
    await this.state_service.ensure_runnable();
    return await this.prompt_runtime.prompt({
      query,
    });
  }

  /**
   * 执行单轮 prompt turn。
   */
  private async execute_prompt_turn(input: {
    turnId: string;
    promptInput: AgentSessionPromptInput;
    onStepMerge: () => Promise<SessionUserMessageV1[]>;
  }): Promise<{
    text: string;
    success: boolean;
    assistantMessage: SessionMessageV1;
    error?: string;
  }> {
    const tool_name_by_call_id = new Map<string, string>();
    const run_context: SessionRunContext = {
      sessionId: this.session_id,
      onStepCallback: input.onStepMerge,
      onAssistantStepCallback: async (step) => {
        this.publish_event({
          type: "assistant-step",
          turnId: input.turnId,
          text: step.text,
          stepIndex: step.stepIndex,
          ...(step.visibility ? { visibility: step.visibility } : {}),
        });
      },
      onUiMessageChunkCallback: async (chunk) => {
        if (chunk.type === "tool-input-start") {
          tool_name_by_call_id.set(chunk.toolCallId, chunk.toolName);
          return;
        }
        const event = mapUiMessageChunkToAgentEvent(chunk);
        if (!event) return;
        const resolved_event =
          (
            event.type === "tool-result" ||
            event.type === "tool-error"
          ) &&
          event.toolName === "unknown"
            ? {
                ...event,
                toolName:
                  tool_name_by_call_id.get(event.toolCallId) || event.toolName,
              }
            : event;
        if (
          resolved_event.type === "tool-call" ||
          resolved_event.type === "tool-error"
        ) {
          tool_name_by_call_id.set(
            resolved_event.toolCallId,
            resolved_event.toolName,
          );
        }
        const session_event = mapAgentEventToSessionEvent({
          event: resolved_event,
          turnId: input.turnId,
        });
        if (session_event) {
          this.publish_event(session_event);
        }
      },
      injectedUserMessages: [],
      deferredPersistedUserMessages: [],
      pendingAssistantFileParts: [],
    };
    const result = await this.executor.run({
      query: input.promptInput.query,
      runContext: run_context,
    });
    await this.state_service.persist_assistant_result(result.assistantMessage);
    await this.state_service.persist_deferred_user_messages(
      result.deferredPersistedUserMessages,
    );
    return {
      text: extractTextFromUiMessage(result.assistantMessage),
      success: result.success,
      assistantMessage: result.assistantMessage,
      ...(result.error ? { error: result.error } : {}),
    };
  }
}
