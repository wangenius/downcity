/**
 * TaskRunnerSession：task runner 的 session 装配模块。
 *
 * 关键点（中文）
 * - 负责构建 task 专用 LocalSessionCore / JsonlSessionHistoryComposer 运行时。
 * - 负责把每轮 user/assistant 消息写入 run 目录对应的 messages.jsonl。
 * - 这些能力与任务编排逻辑解耦后，Runner 主流程会更聚焦于状态流转。
 */

import path from "node:path";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { SessionRunResult } from "@/types/session/SessionRun.js";
import type { TaskSessionRuntimePort } from "@/types/task/TaskRunner.js";
import { LocalSessionCore } from "@session/executors/local/LocalSessionCore.js";
import { drainDeferredPersistedUserMessages } from "@session/SessionRunScope.js";
import { AcpSessionExecutor } from "@session/executors/acp/AcpSessionExecutor.js";
import {
  readEnabledSessionAgentConfig,
  resolveAcpLaunchConfig,
} from "@session/executors/acp/AcpLaunchConfig.js";
import { JsonlSessionHistoryComposer } from "@session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionCompactionComposer } from "@session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionExecutionComposer } from "@session/composer/execution/LocalSessionExecutionComposer.js";
import { DefaultSessionSystemComposer } from "@session/composer/system/default/DefaultSessionSystemComposer.js";
import { shellTools } from "@session/tools/shell/ShellToolDefinition.js";
import type { SessionExecutor } from "@/types/session/SessionExecutor.js";

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
  const historyComposer = params.taskSessionRuntime.getHistoryComposer(params.sessionId);
  await historyComposer.append(
    historyComposer.userText({
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
 */
export function createTaskSessionRuntimePort(params: {
  context: AgentContext;
  runDirAbs: string;
  runSessionId: string;
  userSimulatorSessionId: string;
}): TaskSessionRuntimePort {
  const { context, runDirAbs, runSessionId, userSimulatorSessionId } = params;
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
  const historyComposersBySessionId = new Map<string, JsonlSessionHistoryComposer>();
  const runtimesBySessionId = new Map<string, SessionExecutor>();
  const sessionAgent = readEnabledSessionAgentConfig(context.config);
  const launch = sessionAgent ? resolveAcpLaunchConfig(sessionAgent) : null;

  const resolveTaskHistoryComposer = (sessionId: string): JsonlSessionHistoryComposer => {
    const existing = historyComposersBySessionId.get(sessionId);
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

    const created = new JsonlSessionHistoryComposer({
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
    historyComposersBySessionId.set(key, created);
    return created;
  };

  return {
    getHistoryComposer(sessionId: string): JsonlSessionHistoryComposer {
      return resolveTaskHistoryComposer(sessionId);
    },
    getExecutor(sessionId: string): SessionExecutor {
      const key = String(sessionId || "").trim();
      if (!key) {
        throw new Error("TaskSessionRuntimePort.getExecutor requires a non-empty sessionId");
      }
      const existing = runtimesBySessionId.get(key);
      if (existing) return existing;

      const historyComposer = resolveTaskHistoryComposer(key);
      const created = launch
        ? new AcpSessionExecutor({
            rootPath: context.rootPath,
            sessionId: key,
            logger: context.logger,
            historyComposer,
            systemComposer,
            launch,
          })
        : (() => {
            if (!context.session.model) {
              throw new Error("TaskSessionRuntimePort requires session.model when execution.type is not acp");
            }
            const executionComposer = new LocalSessionExecutionComposer({
              sessionId: key,
              getTools: () => shellTools,
            });
            return new LocalSessionCore({
              model: context.session.model,
              logger: context.logger,
              historyComposer,
              compactionComposer,
              executionComposer,
              systemComposer,
            });
          })();
      runtimesBySessionId.set(key, created);
      return created;
    },
  };
}

/**
 * 把 task session 的 assistant 消息落盘到对应 run context history Composer。
 */
export async function appendTaskAssistantMessage(params: {
  taskSessionRuntime: TaskSessionRuntimePort;
  sessionId: string;
  taskId: string;
  rawResult: SessionRunResult;
}): Promise<void> {
  const historyComposer = params.taskSessionRuntime.getHistoryComposer(params.sessionId);
  const assistantMessage = params.rawResult?.assistantMessage;
  if (assistantMessage && typeof assistantMessage === "object") {
    await historyComposer.append(assistantMessage);
    const deferredInjectedMessages = drainDeferredPersistedUserMessages(
      params.sessionId,
    );
    for (const message of deferredInjectedMessages) {
      await historyComposer.append(message);
    }
    return;
  }
}
