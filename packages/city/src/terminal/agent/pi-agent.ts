/**
 * Pi SDK agent 封装模块。
 *
 * 关键说明（中文）
 * - 封装 @mariozechner/pi-coding-agent 的会话创建与多轮对话。
 * - pi-agent 通过 server 的 /chat/completions 端点调用 AI，
 *   client 只需要 server 地址 + user token，不需要 AI provider 的 API key。
 */
import type { Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@mariozechner/pi-coding-agent";
import type { ModelHandle } from "@downcity/conduit";

// ============================================================
// 类型
// ============================================================

/** Pi-agent 会话 */
export type PiAgentSession = {
  ask(prompt: string): Promise<string>;
};

// ============================================================
// 会话创建
// ============================================================

/** 创建 pi-agent 会话，通过 server 端点调用 AI */
export async function createPiAgentSession(options: {
  /** 模型句柄（来自 server model catalog） */
  model: ModelHandle;
  tools?: string;
  onText?: (text: string) => void;
  onToolStart?: (toolName: string, args: unknown) => void;
  onToolEnd?: (toolName: string, isError: boolean) => void;
}): Promise<PiAgentSession> {
  const { model: handle, tools: toolsOpt, onText, onToolStart, onToolEnd } = options;

  if (!handle.token) {
    throw new Error("User token is required for agent. Please login first.");
  }

  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openai-compatible", handle.token);
  const tools = resolveTools(toolsOpt);

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model: createModel(handle),
    thinkingLevel: "off",
    authStorage,
    modelRegistry: ModelRegistry.inMemory(authStorage),
    resourceLoader: createMinimalResourceLoader(),
    sessionManager: SessionManager.inMemory(process.cwd()),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    }),
    noTools: tools.length === 0 ? "all" : undefined,
    tools: tools.length > 0 ? tools : undefined,
  });

  let activeTurn: { text: string; streamedText: boolean; assistantError?: string } | undefined;

  session.subscribe((event) => {
    if (!activeTurn) return;

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      activeTurn.text += event.assistantMessageEvent.delta;
      activeTurn.streamedText = true;
      onText?.(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "message_end") {
      activeTurn.assistantError = extractAssistantError(event.message) ?? activeTurn.assistantError;
      const finalText = extractAssistantText(event.message);
      if (finalText) {
        activeTurn.text = finalText;
        if (!activeTurn.streamedText) onText?.(finalText);
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      onToolStart?.(event.toolName, event.args);
      return;
    }

    if (event.type === "tool_execution_end") {
      onToolEnd?.(event.toolName, event.isError);
    }
  });

  return {
    ask: async (prompt: string) => {
      activeTurn = { text: "", streamedText: false };
      await session.prompt(prompt, { expandPromptTemplates: false });
      const completedTurn = activeTurn;
      activeTurn = undefined;
      if (completedTurn?.assistantError) {
        throw new Error(`Pi agent request failed: ${completedTurn.assistantError}`);
      }
      return completedTurn?.text.trim() ?? "";
    },
  };
}

// ============================================================
// 内部函数
// ============================================================

function createModel(handle: ModelHandle): Model<"openai-completions"> {
  return {
    id: handle.id,
    name: handle.name,
    api: "openai-completions" as const,
    provider: "openai-compatible",
    baseUrl: handle.endpoint,
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 4096,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens" as const,
    },
  };
}

function resolveTools(value: string | undefined): string[] {
  const mode = value ?? "agent";
  if (mode === "none") return [];
  if (mode === "read-only") return ["read", "grep", "find", "ls"];
  if (mode === "agent") return ["read", "grep", "find", "ls", "bash"];
  if (mode === "coding") return ["read", "grep", "find", "ls", "bash", "edit", "write"];
  return mode.split(",").map((t) => t.trim()).filter(Boolean);
}

function extractAssistantText(message: unknown): string {
  if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content
    .filter(isRecord)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => String(c.text))
    .join("");
}

function extractAssistantError(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== "assistant" || message.stopReason !== "error") return undefined;
  return typeof message.errorMessage === "string" ? message.errorMessage : "unknown error";
}

function createMinimalResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => "You are a minimal test assistant. Answer the user directly.",
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
