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
import type { SessionMutation } from "@/types/session/SessionMutation.js";
import { isAgentSessionPromptInputEmpty } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionRecords.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionPromptRuntime } from "@/session/runtime/SessionPromptRuntime.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import type { SessionQueueCommand } from "@/types/session/SessionQueueCommand.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";
import {
  SessionAssistantMessageWriter,
  SessionRecorder,
} from "@/session/recorder/SessionRecorder.js";
import { from_ui_assistant_parts } from "@/session/recorder/SessionMessageCodec.js";

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

  /** 当前 Session Message Recorder。 */
  recorder: SessionRecorder;
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
  private readonly recorder: SessionRecorder;
  private readonly prompt_runtime: SessionPromptRuntime;

  constructor(options: SessionTurnServiceOptions) {
    this.session_id = options.session_id;
    this.project_root = options.project_root;
    this.executor = options.executor;
    this.state_service = options.state_service;
    this.event_hub = options.event_hub;
    this.recorder = options.recorder;
    this.prompt_runtime = new SessionPromptRuntime({
      sessionId: this.session_id,
      publish: (event) => {
        this.publish_event(event);
      },
      createAndPersistUserMessage: async (input, turn_id, input_type) => {
        return await this.state_service.create_and_persist_user_prompt_message(
          input,
          turn_id,
          input_type,
        );
      },
      appendErrorMessage: async ({ turn_id, message }) => {
        await this.recorder.append_error_message({
          scope: "turn",
          turn_id,
          code: "turn_execution_failed",
          message,
          recoverable: true,
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
  publish_event(mutation: SessionMutation): void {
    this.event_hub.publish(mutation);
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
   * 把 configured state command 加入当前 Session 的统一输入队列。
   */
  enqueue_command(command: SessionQueueCommand): void {
    this.prompt_runtime.enqueue_command(command);
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
    const assistant_writer_ref: {
      current: SessionAssistantMessageWriter | null;
    } = { current: null };
    let assistant_segment_index = 0;
    const ensure_assistant_writer = async (): Promise<SessionAssistantMessageWriter> => {
      if (assistant_writer_ref.current) return assistant_writer_ref.current;
      assistant_segment_index += 1;
      assistant_writer_ref.current = await this.recorder.open_assistant_message({
        turn_id: input.turnId,
        segment_index: assistant_segment_index,
      });
      return assistant_writer_ref.current;
    };
    const run_context: SessionRunContext = {
      turnId: input.turnId,
      sessionId: this.session_id,
      projectRoot: this.project_root,
      onStepCallback: async () => {
        const merged = await input.onStepMerge();
        if (merged.length > 0 && assistant_writer_ref.current) {
          await assistant_writer_ref.current.complete();
          assistant_writer_ref.current = null;
        }
        return merged;
      },
      hasPendingStepInput: () => this.prompt_runtime.has_pending_prompt(),
      onUiMessageChunkCallback: async (chunk) => {
        if (!is_assistant_content_chunk(chunk.type)) return;
        const writer = await ensure_assistant_writer();
        await writer.apply_chunk(chunk);
      },
      onActionCallback: async (event) => {
        await this.state_service.persist_action_event(event);
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
    const final_assistant_parts = result.assistantMessage
      ? from_ui_assistant_parts(result.assistantMessage.parts)
      : [];
    const final_assistant_writer = assistant_writer_ref.current;
    if (final_assistant_writer) {
      for (const part of final_assistant_parts) {
        if (part.type === "file") {
          await final_assistant_writer.append_file_part(part);
        }
      }
      if (input.abortSignal?.aborted) {
        await final_assistant_writer.stop();
      } else if (result.success) {
        await final_assistant_writer.complete();
      } else {
        await final_assistant_writer.fail(result.error);
      }
    } else if (result.assistantMessage) {
      if (final_assistant_parts.length > 0) {
        assistant_segment_index += 1;
        const fallback_writer = await this.recorder.open_assistant_message({
          turn_id: input.turnId,
          segment_index: assistant_segment_index,
        });
        for (const part of final_assistant_parts) await fallback_writer.upsert_part(part);
        if (result.success) await fallback_writer.complete();
        else await fallback_writer.fail(result.error);
      }
    }
    if (!result.success && !input.abortSignal?.aborted && result.error) {
      await this.recorder.append_error_message({
        scope: "turn",
        turn_id: input.turnId,
        code: "turn_execution_failed",
        message: result.error,
        recoverable: true,
      });
    }
    await this.state_service.persist_assistant_result(result.assistantMessage);
    await this.state_service.persist_deferred_user_messages(
      result.deferredPersistedUserMessages,
    );
    if (result.compact_required) {
      await this.executor.compact_history(run_context);
      await this.state_service.touch_metadata();
    }
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

function is_assistant_content_chunk(type: string): boolean {
  return (
    type === "text-start" ||
    type === "text-delta" ||
    type === "text-end" ||
    type === "reasoning-start" ||
    type === "reasoning-delta" ||
    type === "reasoning-end" ||
    type.startsWith("tool-") ||
    type === "file"
  );
}
