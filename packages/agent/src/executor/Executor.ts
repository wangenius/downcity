/**
 * Executor：单个 session 的执行编排器。
 *
 * 关键点（中文）
 * - SDK 对外对象叫 `Session`，这里是内部执行层。
 * - 一个 Executor 只对应一个固定的 `sessionId`。
 * - 负责 history 写入、显式运行上下文、executing 状态、Composer 编排与 tool-loop 执行。
 */

import { streamText, type LanguageModel, type Tool, type ToolExecutionOptions } from "ai";
import { SessionHistoryWriter } from "@executor/composer/history/SessionHistoryWriter.js";
import type { SessionHistoryComposer } from "@executor/composer/history/SessionHistoryComposer.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
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
import type { SessionToolExecutionContext } from "@/types/executor/SessionToolExecutionContext.js";
import type { AgentPluginExecutionRuntime } from "@/types/plugin/PluginRuntime.js";
import { inject_read_image_user_message } from "@executor/tools/file/ReadImageToolBridge.js";
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
   * 读取当前 session 模型支持的总上下文窗口长度。
   */
  get_model_context_window?: () => number | undefined;

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
   * 读取当前 Session effective Agent env。
   */
  getEnv: () => Record<string, string>;

  /** 读取当前 Session effective Agent instruction 文本。 */
  get_systems?: () => string[];

  /** 创建当前 Session effective Plugin 执行视图。 */
  get_plugins?: () => AgentPluginExecutionRuntime;

  /**
   * 可选自定义 context Composer。
   */
  contextComposer?: SessionContextComposer;

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
  private readonly getEnv: ExecutorOptions["getEnv"];
  private readonly get_systems: ExecutorOptions["get_systems"];
  private readonly get_plugins: ExecutorOptions["get_plugins"];
  private readonly get_model_context_window?: ExecutorOptions["get_model_context_window"];
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
    this.getEnv = options.getEnv;
    this.get_systems = options.get_systems;
    this.get_plugins = options.get_plugins;
    this.get_model_context_window = options.get_model_context_window;
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
    });
    this.inflight_service = new ExecutorInflightService({
      session_id: this.sessionId,
      history_store: this.historyStore,
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
      const result = await this.recovery_policy.run_with_retry({
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
      });
      return result;
    } finally {
      await this.release_step_plugins(run_context);
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

    await this.refresh_step_runtime(run_context);
    const composed_context = await this.contextComposer.compose(run_context);
    const tools = this.bind_run_context_to_tools(composed_context.tools, run_context);
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
      const context_window = this.get_model_context_window?.();

      if (retry_count > 0) {
        await this.compactionComposer.run({
          historyStore: this.historyStore,
          model,
          ...(context_window !== undefined ? { context_window } : {}),
          system,
          retryCount: retry_count,
          force: true,
          onAction: emit_compaction_action,
        });
      }
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
      resolve_step_inputs: async () =>
        await this.resolve_step_inputs(run_context),
    });
  }

  /**
   * 在 Assistant writer 完成后归档当前 canonical 历史。
   *
   * 关键点（中文）：持久化 compact 不能发生在流式 Assistant 草稿仍打开时，
   * 因此由 SessionTurnService 在 writer complete/fail 之后显式调用。
   */
  async compact_history(run_context: SessionRunContext): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    let compaction_action_id = "";
    try {
      await this.refresh_step_runtime(run_context);
      const model = this.resolveModelOrThrow();
      const system = await this.systemComposer.resolve(run_context);
      const emit_compaction_action = async (
        action: SessionActionRecordV1,
      ): Promise<void> => {
        if (action.state === "running") compaction_action_id = action.id;
        await this.emitAction(run_context, action);
      };
      const context_window = this.get_model_context_window?.();
      return await this.compactionComposer.run({
        historyStore: this.historyStore,
        model,
        ...(context_window !== undefined ? { context_window } : {}),
        system,
        retryCount: 0,
        force: true,
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
      return { compacted: false, reason: "compact_failed" };
    } finally {
      await this.release_step_plugins(run_context);
    }
  }

  /**
   * 解析下一 Session step 实际使用的运行配置。
   *
   * 关键点（中文）
   * - 调用方必须先提交 Session 统一输入队列，再调用本方法。
   * - 每次调用只读取一次 model、system 与 tools，并把它们传给同一个 `streamText()`。
   */
  private async resolve_step_inputs(run_context: SessionRunContext): Promise<{
    model: LanguageModel;
    system: SessionExecuteInput["system"];
    tools: SessionExecuteInput["tools"];
    context_window?: number;
  }> {
    await this.refresh_step_runtime(run_context);
    const composed_context = await this.contextComposer.compose(run_context);
    const context_window = this.get_model_context_window?.();
    return {
      model: this.resolveModelOrThrow(),
      system: await this.systemComposer.resolve(run_context),
      tools: this.bind_run_context_to_tools(
        composed_context.tools,
        run_context,
      ),
      ...(context_window !== undefined ? { context_window } : {}),
    };
  }

  /**
   * 刷新当前 Session step 的 effective Agent 运行视图。
   */
  private async refresh_step_runtime(
    run_context: SessionRunContext,
  ): Promise<void> {
    await this.release_step_plugins(run_context);
    run_context.agentEnv = Object.freeze({ ...this.getEnv() });
    if (this.get_systems) {
      run_context.agentSystems = Object.freeze([...this.get_systems()]);
    } else {
      delete run_context.agentSystems;
    }
    if (this.get_plugins) {
      run_context.agentPlugins = this.get_plugins().acquire();
    } else {
      delete run_context.agentPlugins;
    }
  }

  /**
   * 释放当前 Session step 持有的 Plugin execution lease。
   */
  private async release_step_plugins(
    run_context: SessionRunContext,
  ): Promise<void> {
    const plugins = run_context.agentPlugins;
    if (!plugins) return;
    delete run_context.agentPlugins;
    await plugins.release();
  }

  /**
   * 为所有 tool execute callback 绑定显式 Session 运行上下文。
   *
   * 关键点（中文）
   * - 每个 step 使用独立包装工具，不会在并行 Session 间共享可变指针。
   * - Agent 与 Shell 工具通过 ToolExecutionOptions.experimental_context 读取显式快照。
   */
  private bind_run_context_to_tools(
    tools: Record<string, Tool>,
    run_context: SessionRunContext,
  ): Record<string, Tool> {
    const execution_context: SessionToolExecutionContext = {
      session_run_context: run_context,
      shell_run_context: {
        ownerContextId: String(run_context.sessionId || "").trim() || undefined,
        turnId: String(run_context.turnId || "").trim() || undefined,
        ...(run_context.agentEnv ? { env: run_context.agentEnv } : {}),
        ...(run_context.shell_approval_gateway
          ? { approval_gateway: run_context.shell_approval_gateway }
          : {}),
      },
    };

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
          const tool_call_id = String(options.toolCallId || "").trim();
          if (tool_call_id && run_context.on_tool_input_ready) {
            await run_context.on_tool_input_ready({
              tool_call_id,
              tool_name: name,
              input: args,
            });
          }
          const output = await original_execute(args, {
            ...options,
            experimental_context: execution_context,
          });
          return inject_read_image_user_message({
            tool_name: name,
            output,
            run_context,
          });
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
    const source = input || {
      sessionId: this.sessionId,
      injectedUserMessages: [],
      deferredPersistedUserMessages: [],
      pendingAssistantFileParts: [],
    };
    const {
      sessionId,
      projectRoot,
      injectedUserMessages,
      deferredPersistedUserMessages,
      pendingAssistantFileParts,
      ...runtime_context
    } = source;
    return {
      ...runtime_context,
      sessionId: String(sessionId || this.sessionId).trim(),
      ...(typeof projectRoot === "string" && projectRoot.trim()
        ? { projectRoot: projectRoot.trim() }
        : {}),
      injectedUserMessages: Array.isArray(injectedUserMessages)
        ? [...injectedUserMessages]
        : [],
      deferredPersistedUserMessages: Array.isArray(deferredPersistedUserMessages)
        ? [...deferredPersistedUserMessages]
        : [],
      pendingAssistantFileParts: Array.isArray(pendingAssistantFileParts)
        ? [...pendingAssistantFileParts]
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
