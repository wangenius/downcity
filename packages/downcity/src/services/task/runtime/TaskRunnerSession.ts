/**
 * TaskRunnerSession：task runner 的 session 装配模块。
 *
 * 关键点（中文）
 * - 负责构建 task 专用 SessionCore / FilePersistor 运行时。
 * - 负责把每轮 user/assistant 消息写入 run 目录对应的 messages.jsonl。
 * - 这些能力与任务编排逻辑解耦后，Runner 主流程会更聚焦于状态流转。
 */

import path from "node:path";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { SessionRunResult } from "@/shared/types/SessionRun.js";
import type { TaskSessionRuntime } from "@/shared/types/TaskRunner.js";
import { SessionCore } from "@session/SessionCore.js";
import { drainDeferredPersistedUserMessages } from "@session/RequestContext.js";
import { AcpSessionRuntime } from "@session/acp/AcpSessionRuntime.js";
import {
  readEnabledSessionAgentConfig,
  resolveAcpLaunchConfig,
} from "@session/acp/AcpSessionSupport.js";
import { FilePersistor } from "@session/runtime/FilePersistor.js";
import { SummaryCompactor } from "@session/runtime/SummaryCompactor.js";
import { RuntimeOrchestrator } from "@session/runtime/RuntimeOrchestrator.js";
import { PromptSystem } from "@session/prompts/system/PromptSystem.js";
import { shellTools } from "@session/tools/shell/Tool.js";
import type { SessionRuntimeLike } from "@/shared/types/SessionRuntime.js";

/**
 * 把 task round 的 user query 落盘到对应 run context。
 */
export async function appendTaskRoundUserMessage(params: {
  taskSessionRuntime: TaskSessionRuntime;
  sessionId: string;
  taskId: string;
  query: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  const text = String(params.query || "").trim();
  if (!text) return;
  const persistor = params.taskSessionRuntime.getPersistor(params.sessionId);
  await persistor.append(
    persistor.userText({
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
 * 构建 task 专用 Session 运行时（独立于 SessionStore 的 SessionCore 缓存）。
 */
export function createTaskSessionRuntime(params: {
  context: ExecutionContext;
  runDirAbs: string;
  runSessionId: string;
  userSimulatorSessionId: string;
}): TaskSessionRuntime {
  const { context, runDirAbs, runSessionId, userSimulatorSessionId } = params;
  const compactor = new SummaryCompactor({
    keepLastMessages: context.config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: context.config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: context.config.context?.messages?.archiveOnCompact,
    compactRatio: context.config.context?.messages?.compactRatio,
  });
  const system = new PromptSystem({
    projectRoot: context.rootPath,
    getStaticSystemPrompts: () => context.systems,
    getRuntime: () => context,
    profile: "task",
  });
  const persistorsBySessionId = new Map<string, FilePersistor>();
  const runtimesBySessionId = new Map<string, SessionRuntimeLike>();
  const sessionAgent = readEnabledSessionAgentConfig(context.config);
  const launch = sessionAgent ? resolveAcpLaunchConfig(sessionAgent) : null;

  const resolveTaskPersistor = (sessionId: string): FilePersistor => {
    const existing = persistorsBySessionId.get(sessionId);
    if (existing) return existing;

    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error("TaskSessionRuntime requires a non-empty sessionId");
    }
    const runMessagesDirPath =
      key === runSessionId
        ? runDirAbs
        : key === userSimulatorSessionId
          ? path.join(runDirAbs, "user-simulator")
          : undefined;

    const created = new FilePersistor({
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
    persistorsBySessionId.set(key, created);
    return created;
  };

  return {
    getPersistor(sessionId: string): FilePersistor {
      return resolveTaskPersistor(sessionId);
    },
    getRuntime(sessionId: string): SessionRuntimeLike {
      const key = String(sessionId || "").trim();
      if (!key) {
        throw new Error("TaskSessionRuntime.getRuntime requires a non-empty sessionId");
      }
      const existing = runtimesBySessionId.get(key);
      if (existing) return existing;

      const persistor = resolveTaskPersistor(key);
      const created = launch
        ? new AcpSessionRuntime({
            rootPath: context.rootPath,
            sessionId: key,
            logger: context.logger,
            persistor,
            prompter: system,
            launch,
          })
        : (() => {
            if (!context.session.model) {
              throw new Error("TaskSessionRuntime requires session.model when execution.type is not acp");
            }
            const orchestrator = new RuntimeOrchestrator({
              sessionId: key,
              getTools: () => shellTools,
            });
            return new SessionCore({
              model: context.session.model,
              logger: context.logger,
              persistor,
              compactor,
              orchestrator,
              prompter: system,
            });
          })();
      runtimesBySessionId.set(key, created);
      return created;
    },
  };
}

/**
 * 把 task session 的 assistant 消息落盘到对应 run context persistor。
 */
export async function appendTaskAssistantMessage(params: {
  taskSessionRuntime: TaskSessionRuntime;
  sessionId: string;
  taskId: string;
  rawResult: SessionRunResult;
}): Promise<void> {
  const persistor = params.taskSessionRuntime.getPersistor(params.sessionId);
  const assistantMessage = params.rawResult?.assistantMessage;
  if (assistantMessage && typeof assistantMessage === "object") {
    await persistor.append(assistantMessage);
    const deferredInjectedMessages = drainDeferredPersistedUserMessages(
      params.sessionId,
    );
    for (const message of deferredInjectedMessages) {
      await persistor.append(message);
    }
    return;
  }
}
