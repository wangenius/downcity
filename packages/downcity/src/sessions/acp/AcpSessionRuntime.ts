/**
 * AcpSessionRuntime：基于 ACP 子进程的 session runtime。
 *
 * 关键点（中文）
 * - 通过 JSON-RPC over stdio 连接外部 coding agent。
 * - 当前仅消费 `session/update -> agent_message_chunk(text)`。
 * - 首次进入 session 时，会把 system 与已持久化历史一起 bootstrap 给 ACP agent。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { Logger } from "@utils/logger/Logger.js";
import type { PersistorComponent } from "@sessions/components/PersistorComponent.js";
import type { PrompterComponent } from "@sessions/components/PrompterComponent.js";
import { requestContext, withRequestContext } from "@sessions/RequestContext.js";
import type { SessionMessageV1 } from "@/types/SessionMessage.js";
import type { SessionRunInput, SessionRunResult } from "@/types/SessionRun.js";
import type { SessionRuntimeLike } from "@/types/SessionRuntime.js";
import type { ResolvedAcpLaunchConfig } from "./AcpSessionSupport.js";
import { generateId } from "@utils/Id.js";

type JsonRpcId = number;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type PromptCollector = {
  chunks: string[];
};

type AcpJsonRpcEnvelope = {
  jsonrpc?: string;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const ACP_PROTOCOL_VERSION = 1;

/**
 * ACP runtime 默认实现。
 */
export class AcpSessionRuntime implements SessionRuntimeLike {
  private readonly rootPath: string;
  private readonly sessionId: string;
  private readonly logger: Logger;
  private readonly persistor: PersistorComponent;
  private readonly prompter: PrompterComponent;
  private readonly launch: ResolvedAcpLaunchConfig;

  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: ReadlineInterface | null = null;
  private nextRequestId = 1;
  private initialized = false;
  private remoteSessionId: string | null = null;
  private bootstrapped = false;
  private running = false;
  private readonly pendingById = new Map<JsonRpcId, PendingRequest>();
  private activePromptRequestId: JsonRpcId | null = null;
  private activePromptCollector: PromptCollector | null = null;

  constructor(options: {
    rootPath: string;
    sessionId: string;
    logger: Logger;
    persistor: PersistorComponent;
    prompter: PrompterComponent;
    launch: ResolvedAcpLaunchConfig;
  }) {
    this.rootPath = String(options.rootPath || "").trim();
    this.sessionId = String(options.sessionId || "").trim();
    this.logger = options.logger;
    this.persistor = options.persistor;
    this.prompter = options.prompter;
    this.launch = options.launch;
    if (!this.rootPath) throw new Error("AcpSessionRuntime requires rootPath");
    if (!this.sessionId) throw new Error("AcpSessionRuntime requires sessionId");
  }

  async run(input: SessionRunInput): Promise<SessionRunResult> {
    if (this.running) {
      throw new Error("AcpSessionRuntime.run does not support concurrent execution");
    }
    const currentCtx = requestContext.getStore();
    const nextContext = {
      ...(currentCtx || {}),
      sessionId: String(currentCtx?.sessionId || this.sessionId || "").trim() || this.sessionId,
      requestId: String(currentCtx?.requestId || "").trim() || generateId(),
    };
    return await withRequestContext(nextContext, async () => {
      this.running = true;
      try {
        await this.ensureReady();
        const remoteSessionId = this.remoteSessionId;
        if (!remoteSessionId) {
          throw new Error("ACP session is not initialized");
        }

        const promptText = await this.buildPromptText(String(input.query || "").trim());
        const requestId = this.sendRequest("session/prompt", {
          sessionId: remoteSessionId,
          prompt: [
            {
              type: "text",
              text: promptText,
            },
          ],
        });
        this.activePromptRequestId = requestId;
        this.activePromptCollector = { chunks: [] };

        const response = (await this.waitForRequest(requestId)) as {
          stopReason?: unknown;
        } | null;
        const stopReason = String(response?.stopReason || "").trim() || "unknown";
        const text = this.activePromptCollector.chunks.join("").trim();
        this.bootstrapped = true;
        this.activePromptCollector = null;
        this.activePromptRequestId = null;

        if (!text) {
          throw new Error(`ACP agent returned no text output (stopReason=${stopReason})`);
        }

        return {
          success: true,
          assistantMessage: this.persistor.assistantText({
            text,
            metadata: {
              sessionId: this.sessionId,
              extra: {
                runtime: "acp",
                agentType: this.launch.type,
                stopReason,
              },
            },
          }),
        };
      } finally {
        this.running = false;
        this.activePromptCollector = null;
        this.activePromptRequestId = null;
      }
    });
  }

  async dispose(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.initialized = false;
    this.remoteSessionId = null;
    this.bootstrapped = false;
    this.stdoutReader?.close();
    this.stdoutReader = null;
    for (const pending of this.pendingById.values()) {
      pending.reject(new Error("ACP runtime disposed"));
    }
    this.pendingById.clear();
    if (!child) return;
    child.kill();
  }

  private async ensureReady(): Promise<void> {
    if (!this.child) {
      await this.spawnProcess();
    }
    if (!this.initialized) {
      await this.initializeClient();
      this.initialized = true;
    }
    if (!this.remoteSessionId) {
      const result = (await this.request("session/new", {
        cwd: this.rootPath,
        mcpServers: [],
      })) as { sessionId?: unknown } | null;
      const sessionId = String(result?.sessionId || "").trim();
      if (!sessionId) {
        throw new Error("ACP session/new did not return sessionId");
      }
      this.remoteSessionId = sessionId;
    }
  }

  private async spawnProcess(): Promise<void> {
    await this.logger.log("info", "[acp] spawn", {
      sessionId: this.sessionId,
      type: this.launch.type,
      command: this.launch.command,
      args: this.launch.args,
    });

    const child = spawn(this.launch.command, this.launch.args, {
      cwd: this.rootPath,
      env: {
        ...process.env,
        ...this.launch.env,
      },
      stdio: "pipe",
    });
    this.child = child;
    this.stdoutReader = createInterface({ input: child.stdout });
    this.stdoutReader.on("line", (line) => {
      void this.onStdoutLine(line);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (!text) return;
      void this.logger.log("warn", "[acp] stderr", {
        sessionId: this.sessionId,
        type: this.launch.type,
        text,
      });
    });
    child.on("exit", (code, signal) => {
      const error = new Error(
        `ACP agent exited unexpectedly (code=${String(code)} signal=${String(signal)})`,
      );
      for (const pending of this.pendingById.values()) {
        pending.reject(error);
      }
      this.pendingById.clear();
      this.child = null;
      this.initialized = false;
      this.remoteSessionId = null;
      this.bootstrapped = false;
    });
  }

  private async initializeClient(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: {
        name: "downcity",
        version: "1.0.0",
      },
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    });
  }

  private async buildPromptText(query: string): Promise<string> {
    if (this.bootstrapped) return query;

    const systemMessages = await this.prompter.resolve();
    const historyMessages = await this.persistor.list();
    const sections: string[] = [];
    const systemText = systemMessages
      .map((message) => normalizeSystemMessageText(message.content))
      .filter(Boolean)
      .join("\n\n");
    if (systemText) {
      sections.push(
        [
          "## System Instructions",
          systemText,
        ].join("\n"),
      );
    }

    const historyText = historyMessages
      .map((message) => stringifySessionMessage(message))
      .filter(Boolean)
      .join("\n\n");
    if (historyText) {
      sections.push(
        [
          "## Conversation History",
          historyText,
        ].join("\n"),
      );
    }

    sections.push(
      [
        "## Current User Request",
        query,
      ].join("\n"),
    );
    return sections.join("\n\n");
  }

  private async onStdoutLine(line: string): Promise<void> {
    const raw = String(line || "").trim();
    if (!raw) return;

    let envelope: AcpJsonRpcEnvelope;
    try {
      envelope = JSON.parse(raw) as AcpJsonRpcEnvelope;
    } catch {
      await this.logger.log("warn", "[acp] invalid_json", {
        sessionId: this.sessionId,
        raw,
      });
      return;
    }

    if (typeof envelope.method === "string" && envelope.id !== undefined) {
      await this.handleIncomingRequest(envelope);
      return;
    }

    if (typeof envelope.method === "string") {
      await this.handleNotification(envelope);
      return;
    }

    if (typeof envelope.id === "number") {
      this.handleResponse(envelope.id, envelope);
    }
  }

  private async handleIncomingRequest(envelope: AcpJsonRpcEnvelope): Promise<void> {
    const requestId = envelope.id;
    if (typeof requestId !== "number" || typeof envelope.method !== "string") return;

    if (envelope.method === "session/request_permission") {
      const optionId = pickPermissionOptionId(envelope.params);
      if (!optionId) {
        this.sendResponse(requestId, {
          outcome: {
            outcome: "cancelled",
          },
        });
        return;
      }
      this.sendResponse(requestId, {
        outcome: {
          outcome: "selected",
          optionId,
        },
      });
      return;
    }

    this.sendError(requestId, -32601, `Unsupported client method: ${envelope.method}`);
  }

  private async handleNotification(envelope: AcpJsonRpcEnvelope): Promise<void> {
    if (envelope.method !== "session/update") return;
    const params = envelope.params as {
      sessionId?: unknown;
      update?: {
        sessionUpdate?: unknown;
        content?: {
          type?: unknown;
          text?: unknown;
        };
      };
    } | null;
    if (!params || String(params.sessionId || "").trim() !== this.remoteSessionId) {
      return;
    }

    const update = params.update;
    if (!update || update.sessionUpdate !== "agent_message_chunk") return;
    const content = update.content;
    if (!content || content.type !== "text") return;
    const text = String(content.text || "");
    if (!text) return;
    this.activePromptCollector?.chunks.push(text);
  }

  private handleResponse(id: number, envelope: AcpJsonRpcEnvelope): void {
    const pending = this.pendingById.get(id);
    if (!pending) return;
    this.pendingById.delete(id);
    if (envelope.error) {
      pending.reject(new Error(formatJsonRpcError(envelope.error)));
      return;
    }
    pending.resolve(envelope.result);
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const requestId = this.sendRequest(method, params);
    return this.waitForRequest(requestId);
  }

  private sendRequest(method: string, params: Record<string, unknown>): number {
    const requestId = this.nextRequestId++;
    this.writeJson({
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    });
    return requestId;
  }

  private waitForRequest(requestId: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingById.set(requestId, { resolve, reject });
    });
  }

  private sendResponse(id: number, result: unknown): void {
    this.writeJson({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  private sendError(id: number, code: number, message: string): void {
    this.writeJson({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    });
  }

  private writeJson(payload: Record<string, unknown>): void {
    if (!this.child?.stdin) {
      throw new Error("ACP agent stdin is not available");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

function normalizeSystemMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) =>
      item && typeof item === "object" && "text" in item
        ? String((item as { text?: unknown }).text || "").trim()
        : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stringifySessionMessage(message: SessionMessageV1): string {
  const role = message.role === "assistant" ? "Assistant" : "User";
  const text = Array.isArray(message.parts)
    ? message.parts
        .map((part) =>
          part && typeof part === "object" && "type" in part && part.type === "text"
            ? String((part as { text?: unknown }).text || "")
            : "",
        )
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";
  if (!text) return "";
  return `${role}: ${text}`;
}

function pickPermissionOptionId(params: unknown): string | null {
  const options = Array.isArray((params as { options?: unknown })?.options)
    ? ((params as { options: Array<{ optionId?: unknown; kind?: unknown }> }).options)
    : [];
  const preferred = options.find((item) => item?.kind === "allow_once");
  const fallbackAllow = options.find((item) => String(item?.kind || "").startsWith("allow"));
  const picked = preferred || fallbackAllow || options[0];
  const optionId = String(picked?.optionId || "").trim();
  return optionId || null;
}

function formatJsonRpcError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error || "Unknown ACP error");
  const message = String((error as { message?: unknown }).message || "").trim();
  const code = (error as { code?: unknown }).code;
  if (message && (typeof code === "number" || typeof code === "string")) {
    return `${message} (code=${String(code)})`;
  }
  return message || JSON.stringify(error);
}
