/**
 * Executor：单个 session 的执行编排器。
 *
 * 关键点（中文）
 * - SDK 对外对象叫 `Session`，这里是内部执行层。
 * - 一个 Executor 只对应一个固定的 `sessionId`。
 * - 负责 history 写入、run scope、executing 状态、Composer 编排与 tool-loop 执行。
 */

import { streamText, type LanguageModel, type Tool, type ToolExecutionOptions } from "ai";
import { withShellRunScope } from "@downcity/shell";
import { SessionHistoryWriter } from "@executor/composer/history/SessionHistoryWriter.js";
import type { SessionHistoryComposer } from "@executor/composer/history/SessionHistoryComposer.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import { withSessionRunScope } from "@executor/SessionRunScope.js";
import { buildSessionStepParts } from "@executor/messages/SessionStepEventMapper.js";
import { JsonlSessionCompactionComposer } from "@executor/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionContextComposer } from "@executor/composer/context/LocalSessionContextComposer.js";
import { CoreEngineRunner } from "@executor/core-engine/CoreEngineRunner.js";
import type { SessionCompactionComposer } from "@executor/composer/compaction/SessionCompactionComposer.js";
import type { SessionContextComposer } from "@executor/composer/context/SessionContextComposer.js";
import type { SessionSystemComposer } from "@executor/composer/system/SessionSystemComposer.js";
import { ExecutorInflightService } from "@executor/services/ExecutorInflightService.js";
import { ExecutorRecoveryPolicy } from "@executor/services/ExecutorRecoveryPolicy.js";
import { generateId } from "@/utils/Id.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { JsonObject } from "@/types/common/Json.js";
import type {
  SessionActionRecordV1,
  SessionRecordV1,
} from "@/executor/types/SessionRecords.js";
import { to_session_action_record } from "@/executor/types/SessionRecords.js";
import type { SessionExecutor } from "@/executor/types/SessionExecutor.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";

type ExecutorOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 对应的 history 事实源。
   */
  historyStore: SessionHistoryStore;

  /**
   * 当前 session 对应的 history Composer。
   *
   * 关键点（中文）
   * - Composer 只负责组装本轮 messages，不负责落盘。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 读取当前 session 使用的模型实例。
   */
  getModel: () => LanguageModel | undefined;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 session 对应的 compaction Composer。
   */
  compactionComposer?: SessionCompactionComposer;

  /**
   * 当前 session 对应的 system Composer。
   */
  systemComposer: SessionSystemComposer;

  /**
   * 获取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;

  /**
   * 可选自定义 context Composer。
   */
  contextComposer?: SessionContextComposer;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * Executor 单实例实现。
 */
export class Executor implements SessionExecutor {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;

  private readonly historyComposer: SessionHistoryComposer;
  private readonly historyStore: SessionHistoryStore;
  private readonly getModel: ExecutorOptions["getModel"];
  private readonly logger: Logger;
  private readonly compactionComposer: SessionCompactionComposer;
  private readonly systemComposer: SessionSystemComposer;
  protected readonly contextComposer: SessionContextComposer;
  private readonly historyWriter: SessionHistoryWriter;
  private readonly inflight_service: ExecutorInflightService;
  private readonly recovery_policy: ExecutorRecoveryPolicy;
  private readonly core_engine_runner: CoreEngineRunner;

  private executing = false;
  private abort_controller: AbortController | null = null;

  constructor(options: ExecutorOptions) {
    const sessionId = String(options.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("Executor requires a non-empty sessionId");
    }

    this.sessionId = sessionId;
    this.historyStore = options.historyStore;
    this.historyComposer = options.historyComposer;
    this.getModel = options.getModel;
    this.logger = options.logger;
    this.compactionComposer =
      options.compactionComposer || new JsonlSessionCompactionComposer();
    this.systemComposer = options.systemComposer;
    this.contextComposer =
      options.contextComposer ||
      new LocalSessionContextComposer({
        sessionId: this.sessionId,
        getTools: options.getTools,
      });
    this.historyWriter = new SessionHistoryWriter({
      sessionId,
      getHistoryStore: () => this.getHistoryStore(),
      runAfterSessionUpdated: options.runAfterSessionUpdated,
    });
    this.inflight_service = new ExecutorInflightService({
      session_id: this.sessionId,
      history_store: this.historyStore,
      run_after_session_updated_async: async () =>
        await this.afterSessionUpdatedAsync(),
    });
    this.recovery_policy = new ExecutorRecoveryPolicy({
      compaction_composer: this.compactionComposer,
      context_composer: this.contextComposer,
      logger: this.logger,
    });
    this.core_engine_runner = new CoreEngineRunner({
      history_store: this.historyStore,
      context_composer: this.contextComposer,
      logger: this.logger,
      should_compact_on_error: (error) =>
        this.compactionComposer.shouldCompactOnError(error),
    });
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.executing;
  }

  /**
   * 请求停止当前执行。
   */
  stop(): boolean {
    if (!this.executing || !this.abort_controller) return false;
    if (!this.abort_controller.signal.aborted) {
      this.abort_controller.abort(new Error("Turn stopped"));
    }
    return true;
  }

  /**
   * 获取当前 session 的 history 事实源。
   */
  getHistoryStore(): SessionHistoryStore {
    return this.historyStore;
  }

  /**
   * 获取当前 session 的执行端口。
   *
   * 关键点（中文）
   * - 兼容 runtime/service 端口语义：Executor 自己就是执行端口。
   */
  getExecutor(): SessionExecutor {
    return this;
  }

  /**
   * 清理当前 session 的执行器运行态。
   *
   * 关键点（中文）
   * - 当前 Executor 不缓存模型实例，模型每轮 run 都从 `getModel()` 读取。
   * - history 是事实源，不应随着执行态一起丢失。
   */
  clearExecutor(): void {}

  /**
   * 触发 session 更新后的异步回调。
   */
  async afterSessionUpdatedAsync(): Promise<void> {
    await this.historyWriter.afterSessionUpdatedAsync();
  }

  /**
   * 追加一条 user 消息。
   */
  async append_user_message(params: {
    message?: SessionRecordV1 | null;
    text?: string;
    extra?: JsonObject;
  }): Promise<void> {
    await this.historyWriter.append_user_message(params);
  }

  /**
   * 追加一条 assistant 消息。
   */
  async append_assistant_message(params: {
    message?: SessionRecordV1 | null;
    fallbackText?: string;
    extra?: JsonObject;
  }): Promise<void> {
    await this.historyWriter.append_assistant_message(params);
  }

  /**
   * 运行当前 session 的一次请求。
   *
   * 关键点（中文）
   * - 这里直接承接单个 Session 实例的一次 run 外层编排。
   * - scope 绑定、assistant step 持久化、executing 状态都收在实例内部。
   */
  async run(params: {
    query: string;
    runContext?: SessionRunContext;
  }): Promise<SessionRunResult> {
    if (this.executing) {
      // 关键点（中文）：同一个 Session 实例只允许一个活跃 run，
      // 否则 step 回调、scope 与执行器状态都会互相污染。
      throw new Error("Executor.run does not support concurrent execution");
    }
    const query = String(params.query || "").trim();
    const run_context = this.createRunContext(params.runContext);
    const providedOnAssistantStepCallback =
      run_context.onAssistantStepCallback;

    const wrappedOnAssistantStepCallback = async (step: {
      text: string;
      stepIndex: number;
      visibility?: "visible" | "internal";
      stepResult?: unknown;
    }): Promise<void> => {
      const step_parts = buildSessionStepParts({
        stepIndex: step.stepIndex,
        stepResult: step.stepResult,
        text: step.text,
        visibility: step.visibility,
      });
      if (step_parts.length > 0) {
        await this.inflight_service.append_assistant_step_parts(step_parts);
      }

      if (typeof providedOnAssistantStepCallback === "function") {
        await providedOnAssistantStepCallback(step);
      }
    };
    run_context.onAssistantStepCallback = wrappedOnAssistantStepCallback;

    const upstream_abort_signal = run_context.abortSignal;
    const abort_controller = new AbortController();
    const abort_from_upstream = () => {
      if (!abort_controller.signal.aborted) {
        abort_controller.abort(upstream_abort_signal?.reason);
      }
    };
    if (upstream_abort_signal?.aborted) {
      abort_from_upstream();
    } else {
      upstream_abort_signal?.addEventListener("abort", abort_from_upstream, {
        once: true,
      });
    }
    this.abort_controller = abort_controller;
    run_context.abortSignal = abort_controller.signal;
    this.executing = true;
    this.recovery_policy.reset_run_state();
    try {
      const result = await withSessionRunScope(
        {
          runContext: run_context,
        },
        async () =>
          await withShellRunScope(
            {
              run_context: {
                session_id: run_context.sessionId,
                ...(run_context.turnId ? { turn_id: run_context.turnId } : {}),
              },
            },
            async () =>
              await this.recovery_policy.run_with_retry({
            query,
            model: this.resolveModelOrThrow(),
            run_context,
            prepare_execute_input: async ({
              query: next_query,
              model,
              run_context: next_run_context,
              retry_count,
            }) =>
              await this.prepareExecuteInput(
                next_query,
                model,
                next_run_context,
                retry_count,
              ),
            execute_prepared_run: async ({
              execute_input,
              model,
              run_context: next_run_context,
            }) =>
              await this.executePreparedRun(
                execute_input,
                model,
                next_run_context,
              ),
              }),
          ),
      );
      return result;
    } finally {
      this.recovery_policy.reset_run_state();
      if (this.abort_controller === abort_controller) {
        this.abort_controller = null;
      }
      upstream_abort_signal?.removeEventListener("abort", abort_from_upstream);
      this.executing = false;
    }
  }

  /**
   * 调用 Composer 组装当前轮执行输入。
   */
  private async prepareExecuteInput(
    query: string,
    model: LanguageModel,
    run_context: SessionRunContext,
    retry_count: number,
  ): Promise<SessionExecuteInput> {
    if (!String(this.historyComposer.sessionId || "").trim()) {
      throw new Error("Executor.run requires historyComposer.sessionId");
    }

    const composed_context = await this.contextComposer.compose(run_context);
    const tools = this.bind_run_scope_to_tools(composed_context.tools, run_context);
    const system = await this.systemComposer.resolve(run_context);
    let compaction_action_id = "";

    try {
      if (retry_count > 0) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: retry_count,
        });
      }

      const emit_compaction_action = async (
        action: SessionActionRecordV1,
      ): Promise<void> => {
        if (action.state === "running") {
          compaction_action_id = action.id;
        }
        await this.emitAction(run_context, action);
      };

      await this.compactionComposer.run({
        historyStore: this.historyStore,
        model,
        system,
        retryCount: retry_count,
        onAction: emit_compaction_action,
      });
    } catch (error) {
      await this.emitAction(run_context, {
        type: "action",
        id:
          compaction_action_id ||
          `compacting:${this.sessionId}:failed:${Date.now()}:${generateId()}`,
        title: "Session records compact failed",
        description: error instanceof Error ? error.message : String(error),
        state: "failed",
        metadata: {
          v: 1,
          ts: Date.now(),
          sessionId: this.sessionId,
        },
      });
      // 压缩失败不阻断主流程，继续使用当前历史消息执行。
    }

    const messages = await this.historyComposer.prepare({
      query,
      tools,
      system,
      model,
      retryCount: retry_count,
    });

    return {
      query,
      system,
      messages,
      tools,
    };
  }

  /**
   * 执行一次已装配完成的运行材料。
   */
  private async executePreparedRun(
    input: SessionExecuteInput,
    model: LanguageModel,
    run_context: SessionRunContext,
  ): Promise<SessionRunResult> {
    return await this.core_engine_runner.run({
      execute_input: input,
      model,
      run_context,
    });
  }

  /**
   * 为所有 tool 的 execute callback 绑定 ShellRunScope。
   *
   * 关键点（中文）
   * - AI SDK 的 streamText 在并行执行 tool callback 时会丢失 AsyncLocalStorage。
   * - 在 tool.execute 入口重新进入 withShellRunScope，确保 Shell 能读取到 session/turn 上下文。
   */
  private bind_run_scope_to_tools(
    tools: Record<string, Tool>,
    run_context: SessionRunContext,
  ): Record<string, Tool> {
    const session_id = String(run_context.sessionId || "").trim();
    const turn_id = String(run_context.turnId || "").trim();
    if (!session_id && !turn_id) return tools;

    const wrapped: Record<string, Tool> = {};
    for (const [name, tool] of Object.entries(tools)) {
      const original_execute = tool.execute;
      if (typeof original_execute !== "function") {
        wrapped[name] = tool;
        continue;
      }
      wrapped[name] = {
        ...tool,
        execute: async (args: unknown, options: ToolExecutionOptions) => {
          return await withShellRunScope(
            {
              run_context: {
                ...(session_id ? { session_id } : {}),
                ...(turn_id ? { turn_id } : {}),
              },
            },
            async () => await original_execute(args, options),
          );
        },
      };
    }
    return wrapped;
  }

  /**
   * 归一化本轮显式运行上下文。
   */
  private createRunContext(
    input?: SessionRunContext,
  ): SessionRunContext {
    return {
      sessionId: String(input?.sessionId || this.sessionId).trim(),
      ...(typeof input?.projectRoot === "string" && input.projectRoot.trim()
        ? { projectRoot: input.projectRoot.trim() }
        : {}),
      ...(typeof input?.onStepCallback === "function"
        ? { onStepCallback: input.onStepCallback }
        : {}),
      ...(typeof input?.onAssistantStepCallback === "function"
        ? { onAssistantStepCallback: input.onAssistantStepCallback }
        : {}),
      ...(typeof input?.onUiMessageChunkCallback === "function"
        ? { onUiMessageChunkCallback: input.onUiMessageChunkCallback }
        : {}),
      ...(typeof input?.onActionCallback === "function"
        ? { onActionCallback: input.onActionCallback }
        : {}),
      ...(input?.abortSignal ? { abortSignal: input.abortSignal } : {}),
      injectedUserMessages: Array.isArray(input?.injectedUserMessages)
        ? [...input.injectedUserMessages]
        : [],
      deferredPersistedUserMessages: Array.isArray(
        input?.deferredPersistedUserMessages,
      )
        ? [...input.deferredPersistedUserMessages]
        : [],
      pendingAssistantFileParts: Array.isArray(input?.pendingAssistantFileParts)
        ? [...input.pendingAssistantFileParts]
        : [],
    };
  }

  /**
   * 发布一次 session action。
   */
  private async emitAction(
    run_context: SessionRunContext,
    action: SessionActionRecordV1,
  ): Promise<void> {
    if (typeof run_context.onActionCallback !== "function") return;
    const action_id =
      String(action.id || "").trim() ||
      `action:${this.sessionId}:${Date.now()}:${generateId()}`;
    const event = to_session_action_record({
      ...action,
      id: action_id,
      metadata: {
        ...action.metadata,
        sessionId: run_context.sessionId || this.sessionId,
        ...(run_context.turnId && !action.metadata.turnId
          ? { turnId: run_context.turnId }
          : {}),
      },
    }, run_context.sessionId || this.sessionId);
    await run_context.onActionCallback(event);
  }

  /**
   * 读取当前 session 模型。
   */
  private resolveModelOrThrow(): LanguageModel {
    const model = this.getModel();
    if (!model) {
      throw new Error("requires a configured model.");
    }
    return model;
  }
}
