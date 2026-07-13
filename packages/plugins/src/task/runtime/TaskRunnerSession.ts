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
import type { LanguageModel, Tool } from "ai";
import type { AgentContext } from "@downcity/agent";
import { Executor } from "@downcity/agent";
import type { SessionRunResult } from "@downcity/agent";
import type { TaskSessionRuntimePort } from "@/task/runtime/TaskRunnerTypes.js";
import { drainDeferredPersistedUserMessages } from "@downcity/agent";
import { JsonlSessionHistoryComposer } from "@downcity/agent";
import { JsonlSessionHistoryStore } from "@downcity/agent";
import { JsonlSessionCompactionComposer } from "@downcity/agent";
import { LocalSessionContextComposer } from "@downcity/agent";
import { DefaultSessionSystemComposer } from "@downcity/agent";
import { Shell } from "@downcity/shell";
import type { SessionExecutor } from "@downcity/agent";

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
  await historyStore.write_record(
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
  const compactionComposer = new JsonlSessionCompactionComposer();
  const systemComposer = new DefaultSessionSystemComposer({
    projectRoot: context.rootPath,
    getStaticSystemPrompts: () => context.systems,
    getContext: () => context,
    profile: "task",
  });
  const historyStoresBySessionId = new Map<string, JsonlSessionHistoryStore>();
  const historyComposersBySessionId = new Map<string, JsonlSessionHistoryComposer>();
  const runtimesBySessionId = new Map<string, SessionExecutor>();
  const shell = new Shell({
    root_path: context.rootPath,
    env: context.env,
    logger: context.logger,
  });
  const shell_tools = shell.tools as unknown as Record<string, Tool>;

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
        getTools: () => shell_tools,
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
        getTools: () => shell_tools,
        getEnv: () => ({ ...context.env }),
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
    await historyStore.write_record(rawResult.assistantMessage);
  }
  const deferredUserMessages = drainDeferredPersistedUserMessages(sessionId);
  for (const deferred of deferredUserMessages) {
    await historyStore.write_record(deferred);
  }
}
