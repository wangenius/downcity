/**
 * SessionTurnService：本地 Session turn 编排服务。
 *
 * 关键点（中文）
 * - 统一管理 prompt actor 调度、turn 执行与 Session 事件流派发。
 * - 该服务负责把 SessionPromptRuntime 与 Executor 连接起来。
 * - metadata、title、assistant 结果持久化等状态副作用交由 SessionStateService 处理。
 */

import { extractTextFromParts, extractTextFromUiMessage } from "@/executor/messages/UIMessageTransformer.js";
import type { Executor } from "@executor/Executor.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import { isAgentSessionPromptInputEmpty } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionRecords.js";
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
   * 当前项目根目录。
   */
  project_root: string;

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
  private readonly project_root: string;
  private readonly executor: Executor;
  private readonly state_service: SessionStateService;
  private readonly event_hub: SessionEventHub;
  private readonly prompt_runtime: SessionPromptRuntime;

  constructor(options: SessionTurnServiceOptions) {
    this.session_id = options.session_id;
    this.project_root = options.project_root;
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
      emit_steer_action: async ({ turn_id, message }) => {
        await this.state_service.emit_action_event({
          id: `steer-message:${message.id}`,
          title: "Session steer message sent",
          description: "Merged a new user message into the active turn.",
          state: "completed",
          turnId: turn_id,
        });
      },
      executeTurn: async ({ turnId, promptInput, onStepMerge, abortSignal }) => {
        return await this.execute_prompt_turn({
          turnId,
          promptInput,
          onStepMerge,
          abortSignal,
        });
      },
      stopTurn: () => this.executor.stop(),
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
    if (isAgentSessionPromptInputEmpty(input)) {
      throw new Error("session.prompt requires a non-empty query");
    }
    await this.state_service.ensure_runnable();
    return await this.prompt_runtime.prompt(input);
  }

  /**
   * 停止当前 turn，并取消尚未被吸收的排队 prompt。
   */
  async stop(): Promise<AgentSessionStopResult> {
    return this.prompt_runtime.stop();
  }

  /**
   * 执行单轮 prompt turn。
   */
  private async execute_prompt_turn(input: {
    turnId: string;
    promptInput: AgentSessionPromptInput;
    onStepMerge: () => Promise<SessionUserMessageV1[]>;
    abortSignal?: AbortSignal;
  }): Promise<{
    text: string;
    success: boolean;
    assistantMessage?: SessionMessageRecordV1 | null;
    error?: string;
  }> {
    const tool_name_by_call_id = new Map<string, string>();
    const run_context: SessionRunContext = {
      turnId: input.turnId,
      sessionId: this.session_id,
      projectRoot: this.project_root,
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
      onActionCallback: async (event) => {
        try {
          await this.state_service.persist_action_event(event);
        } catch {
          // action 持久化失败不应阻断当前 turn。
        }
        this.publish_event(event);
      },
      injectedUserMessages: [],
      deferredPersistedUserMessages: [],
      pendingAssistantFileParts: [],
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    };
    const query = input.promptInput.query;
    const executor_query = typeof query === "string" ? query : extractTextFromParts(query);
    const result = await this.executor.run({
      query: executor_query,
      runContext: run_context,
    });
    await this.state_service.persist_assistant_result(result.assistantMessage);
    await this.state_service.persist_deferred_user_messages(
      result.deferredPersistedUserMessages,
    );
    return {
      text: result.assistantMessage
        ? extractTextFromUiMessage(result.assistantMessage)
        : "",
      success: result.success,
      ...(result.assistantMessage
        ? { assistantMessage: result.assistantMessage }
        : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }
}
