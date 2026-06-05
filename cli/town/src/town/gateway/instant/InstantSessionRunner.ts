/**
 * InstantSessionRunner：Inline Composer 即时模式执行运行器。
 *
 * 关键点（中文）
 * - 统一承接 model 即时 executor。
 * - 每次请求都创建独立临时 session，执行结束后立即清理临时目录与 executor。
 * - 不复用长期 runtime session，也不进入 channel/chat 的普通投递链路。
 */

import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { mkdtemp } from "node:fs/promises";
import { generateId } from "@/utils/Id.js";
import {
  drainDeferredPersistedUserMessages,
  Executor,
  getLogger,
  JsonlSessionCompactionComposer,
  JsonlSessionHistoryComposer,
  JsonlSessionHistoryStore,
  loadStaticSystemPrompts,
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "@downcity/agent";
import type { Logger } from "@downcity/agent";
import type { PlatformAgentOption } from "@downcity/agent";
import type {
  PlatformInlineInstantRunInput,
  PlatformInlineInstantRunResult,
  PlatformInlineInstantRunner,
} from "@downcity/agent";
import { InstantSystemComposer } from "@/town/gateway/instant/InstantSystemComposer.js";
import { createRuntimeModel } from "@/town/city-model/CreateRuntimeModel.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "@/env/ProcessEnv.js";
import type { Logger as AgentLogger } from "@downcity/agent";

type InstantSessionRunnerOptions = {
  /**
   * 根据 agentId 解析项目配置。
   */
  resolveAgentById?: (agentId: string) => Promise<PlatformAgentOption | null>;

  /**
   * 可选统一日志器。
   */
  logger?: Logger;
};

type TempSessionRuntime = {
  /**
   * 本次即时执行使用的临时 sessionId。
   */
  sessionId: string;

  /**
   * 临时 session 落盘目录。
   */
  tempDirPath: string;

  /**
   * 当前临时执行器实例。
   */
  executor: Executor;
};

function buildInstantPrompt(input: {
  prompt: string;
  pageContext?: string;
}): string {
  const prompt = String(input.prompt || "").trim();
  const pageContext = String(input.pageContext || "").trim();
  if (!pageContext) return prompt;
  return [
    prompt,
    "",
    "以下是补充页面上下文（Markdown）：",
    "",
    "```markdown",
    pageContext,
    "```",
  ].join("\n").trim();
}


function readAssistantFallbackText(text: string, resultText: string): string {
  const picked = String(text || "").trim();
  if (picked) return picked;
  return String(resultText || "").trim();
}

function readAssistantMessageText(result: {
  assistantMessage?: {
    parts?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  };
} | null | undefined): string {
  const parts = Array.isArray(result?.assistantMessage?.parts)
    ? result.assistantMessage.parts
    : [];
  return parts
    .map((part) =>
      part?.type === "text" ? String(part.text || "").trim() : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 即时模式运行器默认实现。
 */
export class InstantSessionRunner implements PlatformInlineInstantRunner {
  private readonly resolveAgentById: InstantSessionRunnerOptions["resolveAgentById"];
  private readonly logger: Logger;

  constructor(options?: InstantSessionRunnerOptions) {
    this.resolveAgentById = options?.resolveAgentById;
    this.logger = options?.logger || getLogger();
  }

  async run(
    input: PlatformInlineInstantRunInput,
  ): Promise<PlatformInlineInstantRunResult> {
    const executorType = String(input.executorType || "").trim();
    if (executorType === "model") {
      return await this.runModelInstant({
        ...input,
        executorType: "model",
      });
    }

    throw new Error(`Unsupported inline instant executor: ${String(input.executorType || "")}`);
  }

  private async createTempHistoryComposer(params: {
    rootPath: string;
    sessionId: string;
  }): Promise<{
    tempDirPath: string;
    historyStore: JsonlSessionHistoryStore;
    historyComposer: JsonlSessionHistoryComposer;
  }> {
    const tempDirPath = await mkdtemp(
      path.join(os.tmpdir(), "downcity-inline-instant-"),
    );
    const historyStore = new JsonlSessionHistoryStore({
      rootPath: params.rootPath,
      sessionId: params.sessionId,
      paths: {
        sessionDirPath: tempDirPath,
        messagesDirPath: tempDirPath,
        messagesFilePath: path.join(tempDirPath, "messages.jsonl"),
        metaFilePath: path.join(tempDirPath, "meta.json"),
        archiveDirPath: path.join(tempDirPath, "archive"),
      },
    });
    const historyComposer = new JsonlSessionHistoryComposer({
      store: historyStore,
    });
    return {
      tempDirPath,
      historyStore,
      historyComposer,
    };
  }

  private async executeTempSession(params: {
    sessionRuntime: TempSessionRuntime;
    query: string;
  }): Promise<{ sessionId: string; text: string }> {
    const query = String(params.query || "").trim();
    if (!query) throw new Error("instant prompt cannot be empty");

    const { sessionRuntime } = params;
    try {
      await sessionRuntime.executor.appendUserMessage({
        text: query,
      });

      const result = await sessionRuntime.executor.run({
        query,
      });
      const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage).trim();
      const assistantText = readAssistantMessageText(result);
      const messageForPersistence = resolveAssistantMessageForPersistence(
        result.assistantMessage,
      );
      if (messageForPersistence) {
        await sessionRuntime.executor.appendAssistantMessage({
          message: messageForPersistence,
          fallbackText: readAssistantFallbackText(userVisible, assistantText),
          extra: {
            via: "control_plane_instant",
          },
        });
      }
      const deferredInjectedMessages = drainDeferredPersistedUserMessages(
        sessionRuntime.sessionId,
      );
      for (const message of deferredInjectedMessages) {
        await sessionRuntime.executor.appendUserMessage({
          message,
        });
      }
      return {
        sessionId: sessionRuntime.sessionId,
        text: readAssistantFallbackText(userVisible, assistantText),
      };
    } finally {
      sessionRuntime.executor.clearExecutor();
      await fs.remove(sessionRuntime.tempDirPath).catch(() => undefined);
    }
  }

  private buildSessionId(): string {
    return `inline-instant-model`;
  }

  private async runModelInstant(
    input: PlatformInlineInstantRunInput & { executorType: "model" },
  ): Promise<PlatformInlineInstantRunResult> {
    const modelId = String(input.modelId || "").trim();
    if (!modelId) throw new Error("modelId is required for inline model executor");

    const sessionId = this.buildSessionId();
    const rootPath = process.cwd();
    const { tempDirPath, historyStore, historyComposer } = await this.createTempHistoryComposer({
      rootPath,
      sessionId,
    });
    const model = await createRuntimeModel({
      config: {
        id: "console_inline_instant_model",
        version: "1.0.0",
        execution: {
          type: "api",
          modelId,
        },
      },
      env: mergeProcessEnvWithPlatformGlobalEnv(process.env),
    });
    const compactionComposer = new JsonlSessionCompactionComposer();
    const systemComposer = new InstantSystemComposer({
      prompts: [String(input.system || "").trim()].filter(Boolean),
      projectRoot: rootPath,
    });

    const executor = new Executor({
      sessionId,
      historyStore,
      historyComposer,
      getModel: () => model,
      logger: this.logger as unknown as AgentLogger,
      compactionComposer,
      systemComposer,
      getTools: () => ({}),
    });

    const text = await this.executeTempSession({
      sessionRuntime: {
        sessionId,
        tempDirPath,
        executor,
      },
      query: buildInstantPrompt({
        prompt: String(input.prompt || "").trim(),
        pageContext: input.pageContext,
      }),
    });

    return {
      sessionId: text.sessionId,
      executorType: "model",
      modelId,
      text: text.text,
    };
  }

}
