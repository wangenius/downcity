/**
 * InlineInstantSessionService：Inline Composer 即时模式执行服务。
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
import { getLogger, type Logger } from "@downcity/agent/shared/utils/logger/Logger.js";
import type { ConsoleAgentOption } from "@downcity/agent/shared/types/Console.js";
import type {
  ConsoleInlineInstantRunInput,
  ConsoleInlineInstantRunResult,
  ConsoleInlineInstantService,
} from "@downcity/agent/shared/types/InlineInstant.js";
import { Session } from "@downcity/agent/session/Session.js";
import { JsonlSessionHistoryComposer } from "@downcity/agent/session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionCompactionComposer } from "@downcity/agent/session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionExecutor } from "@downcity/agent/session/executors/local/LocalSessionExecutor.js";
import { InlineInstantSystemComposer } from "@/console/InlineInstantSystemComposer.js";
import { createModel } from "@downcity/agent";
import type { Logger as AgentLogger } from "@downcity/agent/shared/utils/logger/Logger.js";
import { loadStaticSystemPrompts } from "@downcity/agent/session/composer/system/default/StaticPromptCatalog.js";
import { drainDeferredPersistedUserMessages } from "@downcity/agent/session/SessionRunScope.js";
import {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "@downcity/agent/services/chat/runtime/UserVisibleText.js";

type InlineInstantSessionServiceOptions = {
  /**
   * 根据 agentId 解析项目配置。
   */
  resolveAgentById?: (agentId: string) => Promise<ConsoleAgentOption | null>;

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
   * 当前临时 session 实例。
   */
  session: Session;
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
 * 即时模式服务默认实现。
 */
export class InlineInstantSessionService implements ConsoleInlineInstantService {
  private readonly resolveAgentById: InlineInstantSessionServiceOptions["resolveAgentById"];
  private readonly logger: Logger;

  constructor(options?: InlineInstantSessionServiceOptions) {
    this.resolveAgentById = options?.resolveAgentById;
    this.logger = options?.logger || getLogger();
  }

  async run(
    input: ConsoleInlineInstantRunInput,
  ): Promise<ConsoleInlineInstantRunResult> {
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
    historyComposer: JsonlSessionHistoryComposer;
  }> {
    const tempDirPath = await mkdtemp(
      path.join(os.tmpdir(), "downcity-inline-instant-"),
    );
    const historyComposer = new JsonlSessionHistoryComposer({
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
    return {
      tempDirPath,
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
      await sessionRuntime.session.appendUserMessage({
        text: query,
      });

      const result = await sessionRuntime.session.run({
        query,
      });
      const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage).trim();
      const assistantText = readAssistantMessageText(result);
      const messageForPersistence = resolveAssistantMessageForPersistence(
        result.assistantMessage,
      );
      if (messageForPersistence) {
        await sessionRuntime.session.appendAssistantMessage({
          message: messageForPersistence,
          fallbackText: readAssistantFallbackText(userVisible, assistantText),
          extra: {
            via: "console_inline_instant",
          },
        });
      }
      const deferredInjectedMessages = drainDeferredPersistedUserMessages(
        sessionRuntime.sessionId,
      );
      for (const message of deferredInjectedMessages) {
        await sessionRuntime.session.appendUserMessage({
          message,
        });
      }
      return {
        sessionId: sessionRuntime.sessionId,
        text: readAssistantFallbackText(userVisible, assistantText),
      };
    } finally {
      sessionRuntime.session.clearExecutor();
      await fs.remove(sessionRuntime.tempDirPath).catch(() => undefined);
    }
  }

  private buildSessionId(): string {
    return `inline-instant-model`;
  }

  private async runModelInstant(
    input: ConsoleInlineInstantRunInput & { executorType: "model" },
  ): Promise<ConsoleInlineInstantRunResult> {
    const modelId = String(input.modelId || "").trim();
    if (!modelId) throw new Error("modelId is required for inline model executor");

    const sessionId = this.buildSessionId();
    const rootPath = process.cwd();
    const { tempDirPath, historyComposer } = await this.createTempHistoryComposer({
      rootPath,
      sessionId,
    });
    const model = await createModel({
      config: {
        name: "console-inline-instant-model",
        version: "1.0.0",
        execution: {
          type: "api",
          modelId,
        },
      },
    });
    const compactionComposer = new JsonlSessionCompactionComposer();
    const systemComposer = new InlineInstantSystemComposer({
      prompts: [String(input.system || "").trim()].filter(Boolean),
      projectRoot: rootPath,
    });

    const session = new Session({
      sessionId,
      historyComposer,
      createExecutor: (sessionHistoryComposer) =>
        new LocalSessionExecutor({
          model,
          logger: this.logger as unknown as AgentLogger,
          historyComposer: sessionHistoryComposer,
          compactionComposer,
          systemComposer,
          getTools: () => ({}),
        }),
    });

    const text = await this.executeTempSession({
      sessionRuntime: {
        sessionId,
        tempDirPath,
        session,
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
