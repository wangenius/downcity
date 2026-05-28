/**
 * TaskRunnerSession：task runner 的 session 装配模块。
 *
 * 关键点（中文）
 * - 负责构建 task 专用 Executor / JsonlSessionHistoryStore 运行时。
 * - 负责把每轮 user/assistant 消息写入 run 目录对应的 messages.jsonl。
 * - 这些能力与任务编排逻辑解耦后，task 主流程会更聚焦于状态流转。
 * - 当前只有 api 执行模式。
 */

import path from "node:path";
import type { LanguageModel } from "ai";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { Executor } from "@downcity/agent/internal/executor/Executor.js";
import type { SessionRunResult } from "@downcity/agent/internal/executor/types/SessionRun.js";
import type { TaskSessionRuntimePort } from "@/builtins/task/runtime/TaskRunnerTypes.js";
import { drainDeferredPersistedUserMessages } from "@downcity/agent/internal/executor/SessionRunScope.js";
import { JsonlSessionHistoryComposer } from "@downcity/agent/internal/executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionHistoryStore } from "@downcity/agent/internal/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import { JsonlSessionCompactionComposer } from "@downcity/agent/internal/executor/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionContextComposer } from "@downcity/agent/internal/executor/composer/context/LocalSessionContextComposer.js";
import { DefaultSessionSystemComposer } from "@downcity/agent/internal/executor/composer/system/default/DefaultSessionSystemComposer.js";
import { shellTools } from "@downcity/agent/internal/executor/tools/shell/ShellToolDefinition.js";
import type { SessionExecutor } from "@downcity/agent/internal/executor/types/SessionExecutor.js";

/**
 * 把 task round 的 user query 落盘到对应 run context。
 */
export async function appendTaskRoundUserMessage(params: {
  taskSessionRuntime: TaskSessionRuntimePort;
  sessionId: string;
  taskId: string;
  query: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  const text = String(params.query || "").trim();
  if (!text) return;
  const historyStore = params.taskSessionRuntime.getHistoryStore(params.sessionId);
  await historyStore.append(
    historyStore.userText({
      text,
      metadata: {
        sessionId: params.sessionId,
        extra: {
          taskId: params.taskId,
          actorId: params.actorId,
          actorName: params.actorName,
        },
      },
    }),
  );
}

/**
 * 构建 task 专用 Session 运行时（独立于普通 Session 实例缓存）。
 *
 * 关键点（中文）
 * - 使用 Executor 执行，但模型显式来自“任务绑定 session”的 session 级配置。
 * - task runner 自己维护独立 history，不复用原 session 的消息落盘。
 */
export function createTaskSessionRuntimePort(params: {
  context: AgentContext;
  model: LanguageModel;
  runDirAbs: string;
  runSessionId: string;
  userSimulatorSessionId: string;
}): TaskSessionRuntimePort {
  const {
    context,
    model,
    runDirAbs,
    runSessionId,
    userSimulatorSessionId,
  } = params;
  const compactionComposer = new JsonlSessionCompactionComposer({
    keepLastMessages: context.config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: context.config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: context.config.context?.messages?.archiveOnCompact,
    compactRatio: context.config.context?.messages?.compactRatio,
  });
  const systemComposer = new DefaultSessionSystemComposer({
    projectRoot: context.rootPath,
    getStaticSystemPrompts: () => context.systems,
    getContext: () => context,
    profile: "task",
  });
  const historyStoresBySessionId = new Map<string, JsonlSessionHistoryStore>();
  const historyComposersBySessionId = new Map<string, JsonlSessionHistoryComposer>();
  const runtimesBySessionId = new Map<string, SessionExecutor>();

  const resolveTaskHistoryStore = (sessionId: string): JsonlSessionHistoryStore => {
    const existing = historyStoresBySessionId.get(sessionId);
    if (existing) return existing;

    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error("TaskSessionRuntimePort requires a non-empty sessionId");
    }
    const runMessagesDirPath =
      key === runSessionId
        ? runDirAbs
        : key === userSimulatorSessionId
          ? path.join(runDirAbs, "user-simulator")
          : undefined;

    const created = new JsonlSessionHistoryStore({
      rootPath: context.rootPath,
      sessionId: key,
      ...(runMessagesDirPath
        ? {
            paths: {
              sessionDirPath: runMessagesDirPath,
              messagesDirPath: runMessagesDirPath,
              messagesFilePath: path.join(runMessagesDirPath, "messages.jsonl"),
              metaFilePath: path.join(runMessagesDirPath, "meta.json"),
              archiveDirPath: path.join(runMessagesDirPath, "archive"),
            },
          }
        : {}),
    });
    historyStoresBySessionId.set(key, created);
    return created;
  };

  const resolveTaskHistoryComposer = (sessionId: string): JsonlSessionHistoryComposer => {
    const key = String(sessionId || "").trim();
    const existing = historyComposersBySessionId.get(key);
    if (existing) return existing;
    const created = new JsonlSessionHistoryComposer({
      store: resolveTaskHistoryStore(key),
    });
    historyComposersBySessionId.set(key, created);
    return created;
  };

  return {
    getHistoryStore(sessionId: string): JsonlSessionHistoryStore {
      return resolveTaskHistoryStore(sessionId);
    },
    getExecutor(sessionId: string): SessionExecutor {
      const key = String(sessionId || "").trim();
      if (!key) {
        throw new Error("TaskSessionRuntimePort.getExecutor requires a non-empty sessionId");
      }
      const existing = runtimesBySessionId.get(key);
      if (existing) return existing;

      const historyStore = resolveTaskHistoryStore(key);
      const historyComposer = resolveTaskHistoryComposer(key);
      const contextComposer = new LocalSessionContextComposer({
        sessionId: key,
        getTools: () => shellTools,
      });
      const created = new Executor({
        sessionId: key,
        getModel: () => model,
        logger: context.logger,
        historyStore,
        historyComposer,
        compactionComposer,
        contextComposer,
        systemComposer,
        getTools: () => shellTools,
      });
      runtimesBySessionId.set(key, created);
      return created;
    },
  };
}

/**
 * 把 task session 的 assistant 消息落盘到对应 run context history Store。
 */
export async function appendTaskAssistantMessage(params: {
  taskSessionRuntime: TaskSessionRuntimePort;
  sessionId: string;
  taskId: string;
  rawResult: SessionRunResult;
}): Promise<void> {
  const { taskSessionRuntime, sessionId, rawResult } = params;
  const historyStore = taskSessionRuntime.getHistoryStore(sessionId);
  if (rawResult.assistantMessage) {
    await historyStore.append(rawResult.assistantMessage);
  }
  const deferredUserMessages = drainDeferredPersistedUserMessages(sessionId);
  for (const deferred of deferredUserMessages) {
    await historyStore.append(deferred);
  }
}
