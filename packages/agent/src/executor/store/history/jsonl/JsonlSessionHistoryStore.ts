/**
 * JsonlSessionHistoryStore：基于 JSONL 的 session history 事实源。
 *
 * 关键点（中文）
 * - 负责 `.downcity/.../messages/messages.jsonl`、`meta.json`、archive 与文件锁。
 * - append 与 compact 共用同一把文件锁，避免并发覆盖。
 * - 不负责为模型组装 messages；组装逻辑放在 `JsonlSessionHistoryComposer`。
 */

import fs from "fs-extra";
import {
  open as openFile,
  readFile as readFileNative,
  stat as statNative,
} from "node:fs/promises";
import path from "node:path";
import { generateId } from "@/utils/Id.js";
import { getLogger } from "@/utils/logger/Logger.js";
import { compactSessionMessagesIfNeeded } from "@executor/composer/compaction/jsonl/JsonlSessionCompactionExecutor.js";
import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@/executor/types/SessionMessages.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import type { SessionHistoryPathOverrides } from "@/executor/types/SessionHistoryPaths.js";
import type {
  SessionHistoryCompactInput,
  SessionHistoryStore,
} from "@/executor/store/history/SessionHistoryStore.js";

/**
 * JSONL history store 构造参数。
 */
export type JsonlSessionHistoryStoreOptions = {
  /**
   * 当前项目根目录。
   */
  rootPath: string;
  /**
   * 当前 agentId。
   *
   * 关键点（中文）
   * - 仅在未提供 `paths` 覆盖时必需。
   * - 默认目录统一收敛到 `.downcity/agents/<agentId>/sessions/...`。
   */
  agentId?: string;
  /**
   * 当前 sessionId。
   */
  sessionId?: string;
  /**
   * 可选路径覆盖，供 SDK session / task run 复用同一 JSONL store。
   */
  paths?: SessionHistoryPathOverrides;
};

function getDowncityDirPath(rootPath: string): string {
  return path.join(rootPath, ".downcity");
}

function getDowncityAgentsRootDirPath(rootPath: string): string {
  return path.join(getDowncityDirPath(rootPath), "agents");
}

function getDowncitySessionRootDirPath(rootPath: string, agentId: string): string {
  return path.join(
    getDowncityAgentsRootDirPath(rootPath),
    encodeURIComponent(agentId),
    "sessions",
  );
}

function getDowncitySessionDirPath(
  rootPath: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getDowncitySessionRootDirPath(rootPath, agentId),
    encodeURIComponent(sessionId),
  );
}

function getDowncitySessionMessagesDirPath(
  rootPath: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getDowncitySessionDirPath(rootPath, agentId, sessionId),
    "messages",
  );
}

/**
 * JSONL Session history store。
 */
export class JsonlSessionHistoryStore implements SessionHistoryStore {
  readonly sessionId: string;

  private readonly rootPath: string;
  private readonly agentId?: string;
  private readonly overrideSessionDirPath?: string;
  private readonly overrideMessagesDirPath?: string;
  private readonly overrideMessagesFilePath?: string;
  private readonly overrideMetaFilePath?: string;
  private readonly overrideArchiveDirPath?: string;
  private readonly overrideInflightFilePath?: string;

  constructor(options: JsonlSessionHistoryStoreOptions) {
    const rootPath = String(options.rootPath || "").trim();
    if (!rootPath) {
      throw new Error("JsonlSessionHistoryStore requires a non-empty rootPath");
    }
    const sessionId = String(options.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("JsonlSessionHistoryStore requires a non-empty sessionId");
    }

    this.rootPath = rootPath;
    this.sessionId = sessionId;
    this.agentId = this.readOptionalPath(options.agentId);
    this.overrideSessionDirPath = this.readOptionalPath(
      options.paths?.sessionDirPath,
    );
    this.overrideMessagesDirPath = this.readOptionalPath(
      options.paths?.messagesDirPath,
    );
    this.overrideMessagesFilePath = this.readOptionalPath(
      options.paths?.messagesFilePath,
    );
    this.overrideMetaFilePath = this.readOptionalPath(
      options.paths?.metaFilePath,
    );
    this.overrideArchiveDirPath = this.readOptionalPath(
      options.paths?.archiveDirPath,
    );
    this.overrideInflightFilePath = this.readOptionalPath(
      options.paths?.inflightFilePath,
    );
  }

  private readOptionalPath(value: string | undefined): string | undefined {
    const out = String(value || "").trim();
    return out || undefined;
  }

  private getMessagesDirPath(): string {
    if (this.overrideMessagesDirPath) return this.overrideMessagesDirPath;
    if (this.overrideSessionDirPath) {
      return path.join(this.overrideSessionDirPath, "messages");
    }
    if (!this.agentId) {
      throw new Error(
        "JsonlSessionHistoryStore requires agentId when default session paths are used",
      );
    }
    return getDowncitySessionMessagesDirPath(
      this.rootPath,
      this.agentId,
      this.sessionId,
    );
  }

  private getMessagesFilePath(): string {
    if (this.overrideMessagesFilePath) return this.overrideMessagesFilePath;
    if (this.overrideMessagesDirPath) {
      return path.join(this.overrideMessagesDirPath, "messages.jsonl");
    }
    return path.join(this.getMessagesDirPath(), "messages.jsonl");
  }

  private getMetaFilePath(): string {
    if (this.overrideMetaFilePath) return this.overrideMetaFilePath;
    if (this.overrideMessagesDirPath) {
      return path.join(this.overrideMessagesDirPath, "meta.json");
    }
    return path.join(this.getMessagesDirPath(), "meta.json");
  }

  private getArchiveDirPath(): string {
    if (this.overrideArchiveDirPath) return this.overrideArchiveDirPath;
    if (this.overrideMessagesDirPath) {
      return path.join(this.overrideMessagesDirPath, "archive");
    }
    return path.join(this.getMessagesDirPath(), "archive");
  }

  private getInflightFilePath(): string {
    if (this.overrideInflightFilePath) return this.overrideInflightFilePath;
    if (this.overrideMessagesDirPath) {
      return path.join(this.overrideMessagesDirPath, "inflight.json");
    }
    return path.join(this.getMessagesDirPath(), "inflight.json");
  }

  private getLockFilePath(): string {
    return path.join(this.getMessagesDirPath(), ".session.lock");
  }

  private async ensureLayout(): Promise<void> {
    // 关键点（中文）：以 messages 目录为最小落盘单元，统一保证 messages/meta/archive 可写。
    await fs.ensureDir(this.getMessagesDirPath());
    await fs.ensureDir(this.getArchiveDirPath());
    await fs.ensureFile(this.getMessagesFilePath());
  }

  private normalizeText(input: unknown): string | undefined {
    const value = typeof input === "string" ? input.trim() : "";
    return value || undefined;
  }

  private normalizePersistedMessage(
    input: unknown,
  ): SessionMessageV1 | null {
    if (!input || typeof input !== "object") return null;
    const candidate = input as Partial<SessionMessageV1>;
    const role = String(candidate.role || "");
    if (role !== "user" && role !== "assistant") return null;
    if (!Array.isArray(candidate.parts)) return null;
    return candidate as SessionMessageV1;
  }

  private hasStructuredAssistantParts(message: SessionMessageV1 | null): boolean {
    if (!message || message.role !== "assistant" || !Array.isArray(message.parts)) {
      return false;
    }
    return message.parts.some((part) => {
      if (!part || typeof part !== "object") return false;
      const type = typeof part.type === "string" ? part.type.trim() : "";
      return Boolean(type) && type !== "text";
    });
  }

  private mergeInflightWithFinal(
    inflight: SessionMessageV1,
    finalMessage: SessionMessageV1,
  ): SessionMessageV1 {
    const final_parts = Array.isArray(finalMessage.parts)
      ? finalMessage.parts.filter((part) => part && typeof part === "object")
      : [];
    if (this.hasStructuredAssistantParts(finalMessage)) {
      return finalMessage;
    }
    if (final_parts.length === 0) return inflight;

    const inflight_parts = Array.isArray(inflight.parts)
      ? inflight.parts
      : [];
    const last_inflight_part =
      inflight_parts.length > 0 ? inflight_parts[inflight_parts.length - 1] : undefined;
    const last_inflight_text =
      last_inflight_part &&
      typeof last_inflight_part === "object" &&
      last_inflight_part.type === "text" &&
      typeof last_inflight_part.text === "string"
        ? last_inflight_part.text.trim()
        : "";
    const append_parts = final_parts.filter((part, index) => {
      if (index > 0) return true;
      if (!part || typeof part !== "object" || part.type !== "text") return true;
      const next_text = typeof part.text === "string" ? part.text.trim() : "";
      if (!next_text) return false;
      return next_text !== last_inflight_text;
    });

    return {
      ...inflight,
      id: finalMessage.id,
      metadata: {
        ...(inflight.metadata || {
          v: 1 as const,
          ts: Date.now(),
          sessionId: this.sessionId,
        }),
        ...(finalMessage.metadata || {}),
      },
      parts: [...inflight_parts, ...append_parts],
    };
  }

  private async readMetaUnsafe(): Promise<SessionHistoryMetaV1> {
    const file = this.getMetaFilePath();
    try {
      const raw = (await fs.readJson(
        file,
      )) as Partial<SessionHistoryMetaV1> | null;
      if (!raw || typeof raw !== "object") throw new Error("invalid_meta");
      return {
        v: 1,
        sessionId: this.sessionId,
        ...(typeof raw.agentId === "string" && raw.agentId.trim()
          ? { agentId: raw.agentId.trim() }
          : {}),
        ...(typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
          ? { createdAt: raw.createdAt }
          : {}),
        ...(this.normalizeText(raw.timezone)
          ? { timezone: this.normalizeText(raw.timezone) }
          : {}),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
        ...(this.normalizeText(raw.title)
          ? { title: this.normalizeText(raw.title) }
          : {}),
        ...(this.normalizeText(raw.modelLabel)
          ? { modelLabel: this.normalizeText(raw.modelLabel) }
          : {}),
      };
    } catch {
      return {
        v: 1,
        sessionId: this.sessionId,
        createdAt: Date.now(),
        updatedAt: 0,
      };
    }
  }

  private async writeMetaUnsafe(next: SessionHistoryMetaV1): Promise<void> {
    const normalized: SessionHistoryMetaV1 = {
      v: 1,
      sessionId: this.sessionId,
      ...(typeof next.agentId === "string" && next.agentId.trim()
        ? { agentId: next.agentId.trim() }
        : {}),
      ...(typeof next.createdAt === "number" && Number.isFinite(next.createdAt)
        ? { createdAt: next.createdAt }
        : {}),
      ...(this.normalizeText(next.timezone)
        ? { timezone: this.normalizeText(next.timezone) }
        : {}),
      updatedAt:
        typeof next.updatedAt === "number" ? next.updatedAt : Date.now(),
      ...(this.normalizeText(next.title)
        ? { title: this.normalizeText(next.title) }
        : {}),
      ...(this.normalizeText(next.modelLabel)
        ? { modelLabel: this.normalizeText(next.modelLabel) }
        : {}),
    };
    await fs.writeJson(this.getMetaFilePath(), normalized, { spaces: 2 });
  }

  private async readInflightUnsafe(): Promise<SessionMessageV1 | null> {
    const file = this.getInflightFilePath();
    try {
      const raw = await fs.readJson(file);
      return this.normalizePersistedMessage(raw);
    } catch {
      return null;
    }
  }

  private async writeInflightUnsafe(message: SessionMessageV1): Promise<void> {
    const normalized = this.normalizePersistedMessage(message);
    if (!normalized || normalized.role !== "assistant") {
      throw new Error("inflight assistant must be an assistant UIMessage");
    }
    const file = this.getInflightFilePath();
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.ensureDir(path.dirname(file));
    await fs.writeJson(temp, normalized, { spaces: 2 });
    await fs.move(temp, file, { overwrite: true });
  }

  private async removeInflightUnsafe(): Promise<void> {
    await fs.remove(this.getInflightFilePath());
  }

  private async appendMessageUnsafe(message: SessionMessageV1): Promise<void> {
    await fs.appendFile(
      this.getMessagesFilePath(),
      JSON.stringify(message) + "\n",
      "utf8",
    );
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureLayout();
    const lockPath = this.getLockFilePath();
    const token = `${process.pid}:${Date.now()}:${generateId()}`;
    const logger = getLogger(this.rootPath, "info");

    // 关键点（中文）：append 与 compact 共用同一把文件锁，防止 rewrite 覆盖 append。
    const staleMs = 30_000;
    const start = Date.now();
    while (true) {
      try {
        const fh = await openFile(lockPath, "wx");
        await fh.writeFile(token, "utf8");
        await fh.close();
        break;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "EEXIST") throw err;
        try {
          const stat = await statNative(lockPath);
          const age = Date.now() - stat.mtimeMs;
          if (age > staleMs) {
            await fs.remove(lockPath);
            await logger.log("warn", "Removed stale session lock", {
              sessionId: this.sessionId,
              lockPath,
              ageMs: age,
            });
            continue;
          }
        } catch {
          // ignore
        }
        if (Date.now() - start > staleMs * 2) {
          throw new Error(`Context lock timeout: ${lockPath}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    }

    try {
      return await fn();
    } finally {
      try {
        const current = await readFileNative(lockPath, "utf8");
        if (String(current || "").trim() === token) {
          await fs.remove(lockPath);
        }
      } catch {
        // ignore
      }
    }
  }

  private normalizeSystem(system: SessionSystemMessage[]): SessionSystemMessage[] {
    if (!Array.isArray(system)) return [];
    return system.filter((item) => item && typeof item === "object");
  }

  async compact(input: SessionHistoryCompactInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    return await compactSessionMessagesIfNeeded(
      {
        rootPath: this.rootPath,
        sessionId: this.sessionId,
        withWriteLock: (fn) => this.withWriteLock(fn),
        loadAll: () => this.list(),
        createSummaryMessage: ({ text, archiveId, sourceRange }) => ({
          id: `a:${this.sessionId}:${generateId()}`,
          role: "assistant",
          metadata: {
            v: 1,
            ts: Date.now(),
            sessionId: this.sessionId,
            source: "compact",
            kind: "summary",
            ...(archiveId ? { archiveId } : {}),
            ...(sourceRange ? { sourceRange } : {}),
          },
          parts: [{ type: "text", text: String(text ?? "") }],
        }),
        getArchiveDirPath: () => this.getArchiveDirPath(),
        getMessagesFilePath: () => this.getMessagesFilePath(),
        readMetaUnsafe: () => this.readMetaUnsafe(),
        writeMetaUnsafe: (next) => this.writeMetaUnsafe(next),
      },
      {
        model: input.model,
        system: this.normalizeSystem(input.system),
        keepLastMessages: input.keepLastMessages,
        maxInputTokensApprox: input.maxInputTokensApprox,
        archiveOnCompact: input.archiveOnCompact,
        compactRatio: input.compactRatio,
      },
    );
  }

  async append(message: SessionMessageV1): Promise<void> {
    await this.withWriteLock(async () => {
      const normalized = this.normalizePersistedMessage(message);
      if (!normalized) return;

      // 关键点（中文）：若上一次 assistant 在运行中中断，新的 user 到来前先把残留快照收口到正式历史，
      // 避免 `list()` 时旧 inflight 跑到新 user 后面，打乱时序。
      if (normalized.role === "user") {
        const current_inflight = await this.readInflightUnsafe();
        if (current_inflight) {
          await this.appendMessageUnsafe(current_inflight);
          await this.removeInflightUnsafe();
        }
      }

      await this.appendMessageUnsafe(normalized);
    });
  }

  /**
   * 批量追加消息。
   *
   * 关键点（中文）
   * - 一次锁、一次 IO，适合 fork 等需要拷贝整段历史的场景。
   * - 不处理 inflight，调用方需自行确保历史已经收口。
   */
  async appendMany(messages: SessionMessageV1[]): Promise<void> {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const normalized_list = messages
      .map((message) => this.normalizePersistedMessage(message))
      .filter((message): message is SessionMessageV1 => message !== null);
    if (normalized_list.length === 0) return;

    const payload = normalized_list
      .map((message) => `${JSON.stringify(message)}\n`)
      .join("");
    await this.withWriteLock(async () => {
      await fs.appendFile(this.getMessagesFilePath(), payload, "utf8");
    });
  }

  async readInflight(): Promise<SessionMessageV1 | null> {
    await this.ensureLayout();
    return this.readInflightUnsafe();
  }

  async writeInflight(message: SessionMessageV1): Promise<void> {
    await this.withWriteLock(async () => {
      await this.writeInflightUnsafe(message);
    });
  }

  async finalizeInflight(message?: SessionMessageV1 | null): Promise<void> {
    await this.withWriteLock(async () => {
      const current_inflight = await this.readInflightUnsafe();
      const normalized_message = this.normalizePersistedMessage(message);
      const final_message =
        current_inflight && normalized_message
          ? this.mergeInflightWithFinal(current_inflight, normalized_message)
          : normalized_message || current_inflight;
      if (final_message) {
        await this.appendMessageUnsafe(final_message);
      }
      if (current_inflight) {
        await this.removeInflightUnsafe();
      }
    });
  }

  async list(): Promise<SessionMessageV1[]> {
    await this.ensureLayout();
    const file = this.getMessagesFilePath();
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const out: SessionMessageV1[] = [];
    for (const line of lines) {
      try {
        const obj = this.normalizePersistedMessage(JSON.parse(line));
        if (!obj) continue;
        out.push(obj);
      } catch {
        // ignore invalid lines
      }
    }
    const current_inflight = await this.readInflightUnsafe();
    if (current_inflight) {
      out.push(current_inflight);
    }
    return out;
  }

  async slice(start: number, end: number): Promise<SessionMessageV1[]> {
    const msgs = await this.list();
    const startIndex = Math.max(0, Math.floor(start));
    const endIndex = Math.max(startIndex, Math.floor(end));
    return msgs.slice(startIndex, endIndex);
  }

  async size(): Promise<number> {
    const msgs = await this.list();
    return msgs.length;
  }

  async meta(): Promise<Record<string, unknown>> {
    await this.ensureLayout();
    const metadata = await this.readMetaUnsafe();
    return (
      metadata && typeof metadata === "object" ? { ...metadata } : {}
    ) as Record<string, unknown>;
  }

  userText(input: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
  }): SessionMessageV1 {
    const { ts, ...metadata } = input.metadata;
    const md: SessionMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: "ingress",
      kind: "normal",
    };
    const id = input.id || `u:${this.sessionId}:${generateId()}`;
    return {
      id,
      role: "user",
      metadata: md,
      parts: [{ type: "text", text: String(input.text ?? "") }],
    };
  }

  assistantText(input: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): SessionMessageV1 {
    const { ts, ...metadata } = input.metadata;
    const md: SessionMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: input.source || "egress",
      kind: input.kind || "normal",
    };
    const id = input.id || `a:${this.sessionId}:${generateId()}`;
    return {
      id,
      role: "assistant",
      metadata: md,
      parts: [{ type: "text", text: String(input.text ?? "") }],
    };
  }
}
