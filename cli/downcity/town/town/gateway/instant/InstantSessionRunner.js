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
import { drainDeferredPersistedUserMessages, Executor, getLogger, JsonlSessionCompactionComposer, JsonlSessionHistoryComposer, JsonlSessionHistoryStore, pickLastSuccessfulChatSendText, resolveAssistantMessageForPersistence, } from "@downcity/agent";
import { InstantSystemComposer } from "@/town/gateway/instant/InstantSystemComposer.js";
import { createRuntimeModel } from "@/town/city-model/CreateRuntimeModel.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "@/env/ProcessEnv.js";
function buildInstantPrompt(input) {
    const prompt = String(input.prompt || "").trim();
    const pageContext = String(input.pageContext || "").trim();
    if (!pageContext)
        return prompt;
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
function readAssistantFallbackText(text, resultText) {
    const picked = String(text || "").trim();
    if (picked)
        return picked;
    return String(resultText || "").trim();
}
function readAssistantMessageText(result) {
    const parts = Array.isArray(result?.assistantMessage?.parts)
        ? result.assistantMessage.parts
        : [];
    return parts
        .map((part) => part?.type === "text" ? String(part.text || "").trim() : "")
        .filter(Boolean)
        .join("\n")
        .trim();
}
/**
 * 即时模式运行器默认实现。
 */
export class InstantSessionRunner {
    resolveAgentById;
    logger;
    constructor(options) {
        this.resolveAgentById = options?.resolveAgentById;
        this.logger = options?.logger || getLogger();
    }
    async run(input) {
        const executorType = String(input.executorType || "").trim();
        if (executorType === "model") {
            return await this.runModelInstant({
                ...input,
                executorType: "model",
            });
        }
        throw new Error(`Unsupported inline instant executor: ${String(input.executorType || "")}`);
    }
    async createTempHistoryComposer(params) {
        const tempDirPath = await mkdtemp(path.join(os.tmpdir(), "downcity-inline-instant-"));
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
    async executeTempSession(params) {
        const query = String(params.query || "").trim();
        if (!query)
            throw new Error("instant prompt cannot be empty");
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
            const messageForPersistence = resolveAssistantMessageForPersistence(result.assistantMessage);
            if (messageForPersistence) {
                await sessionRuntime.executor.appendAssistantMessage({
                    message: messageForPersistence,
                    fallbackText: readAssistantFallbackText(userVisible, assistantText),
                    extra: {
                        via: "control_plane_instant",
                    },
                });
            }
            const deferredInjectedMessages = drainDeferredPersistedUserMessages(sessionRuntime.sessionId);
            for (const message of deferredInjectedMessages) {
                await sessionRuntime.executor.appendUserMessage({
                    message,
                });
            }
            return {
                sessionId: sessionRuntime.sessionId,
                text: readAssistantFallbackText(userVisible, assistantText),
            };
        }
        finally {
            sessionRuntime.executor.clearExecutor();
            await fs.remove(sessionRuntime.tempDirPath).catch(() => undefined);
        }
    }
    buildSessionId() {
        return `inline-instant-model`;
    }
    async runModelInstant(input) {
        const modelId = String(input.modelId || "").trim();
        if (!modelId)
            throw new Error("modelId is required for inline model executor");
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
            logger: this.logger,
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
//# sourceMappingURL=InstantSessionRunner.js.map