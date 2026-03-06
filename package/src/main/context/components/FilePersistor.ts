/**
 * FilePersistor：基于 JSONL 的会话持久化组件实现。
 *
 * 关键点（中文）
 * - 以 `.ship/context/<contextId>/messages/messages.jsonl` 为事实源。
 * - append 与 compact 共用同一把文件锁，避免并发覆盖。
 * - 对 Agent 暴露统一的 Persistor 组件接口。
 */

import fs from "fs-extra";
import {
  open as openFile,
  readFile as readFileNative,
  stat as statNative,
} from "node:fs/promises";
import path from "node:path";
import {
  convertToModelMessages, type ModelMessage,
  type SystemModelMessage,
  type Tool,
  type ToolSet
} from "ai";
import { generateId } from "@utils/Id.js";
import { getLogger } from "@utils/logger/Logger.js";
import { compactContextMessageIfNeeded } from "@/main/context/components/SummaryCompact.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { ShipContextMessagesMetaV1 } from "@main/types/ContextMessagesMeta.js";
import type { PersistorPathOverrides } from "@main/types/PersistorPaths.js";
import {
  PersistorComponent,
  type PersistorCompactInput,
  type PersistorPrepareInput,
} from "@main/agent/components/PersistorComponent.js";

type FilePersistorOptions = {
  rootPath: string;
  contextId: string;
  paths?: PersistorPathOverrides;
};

function getShipDirPath(rootPath: string): string {
  return path.join(rootPath, ".ship");
}

function getShipContextRootDirPath(rootPath: string): string {
  return path.join(getShipDirPath(rootPath), "context");
}

function getShipContextDirPath(rootPath: string, contextId: string): string {
  return path.join(
    getShipContextRootDirPath(rootPath),
    encodeURIComponent(contextId),
  );
}

function getShipContextMessagesDirPath(
  rootPath: string,
  contextId: string,
): string {
  return path.join(getShipContextDirPath(rootPath, contextId), "messages");
}

export class FilePersistor extends PersistorComponent {
  readonly name = "file_persistor";
  readonly contextId: string;

  private readonly rootPath: string;
  private readonly overrideContextDirPath?: string;
  private readonly overrideMessagesDirPath?: string;
  private readonly overrideMessagesFilePath?: string;
  private readonly overrideMetaFilePath?: string;
  private readonly overrideArchiveDirPath?: string;

  constructor(options: FilePersistorOptions) {
    super();
    const rootPath = String(options.rootPath || "").trim();
    if (!rootPath) {
      throw new Error("FilePersistor requires a non-empty rootPath");
    }
    const contextId = String(options.contextId || "").trim();
    if (!contextId) {
      throw new Error("FilePersistor requires a non-empty contextId");
    }

    this.rootPath = rootPath;
    this.contextId = contextId;
    this.overrideContextDirPath = this.readOptionalPath(
      options.paths?.contextDirPath,
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
  }

  private readOptionalPath(value: string | undefined): string | undefined {
    const out = String(value || "").trim();
    return out || undefined;
  }

  private getMessagesDirPath(): string {
    if (this.overrideMessagesDirPath) return this.overrideMessagesDirPath;
    if (this.overrideContextDirPath) {
      return path.join(this.overrideContextDirPath, "messages");
    }
    return getShipContextMessagesDirPath(this.rootPath, this.contextId);
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

  private getLockFilePath(): string {
    return path.join(this.getMessagesDirPath(), ".context.lock");
  }

  private async ensureLayout(): Promise<void> {
    // 关键点（中文）：以 messages 目录为最小落盘单元，统一保证 messages/meta/archive 可写。
    await fs.ensureDir(this.getMessagesDirPath());
    await fs.ensureDir(this.getArchiveDirPath());
    await fs.ensureFile(this.getMessagesFilePath());
  }

  private normalizePinnedSkillIds(input: string[] | undefined): string[] {
    if (!Array.isArray(input)) return [];
    const out: string[] = [];
    for (const raw of input) {
      const id = typeof raw === "string" ? raw.trim() : "";
      if (!id) continue;
      out.push(id);
    }
    return Array.from(new Set(out)).slice(0, 2000);
  }

  private async readMetaUnsafe(): Promise<ShipContextMessagesMetaV1> {
    const file = this.getMetaFilePath();
    try {
      const raw = (await fs.readJson(
        file,
      )) as Partial<ShipContextMessagesMetaV1> | null;
      if (!raw || typeof raw !== "object") throw new Error("invalid_meta");
      return {
        v: 1,
        contextId: this.contextId,
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
        pinnedSkillIds: this.normalizePinnedSkillIds(raw.pinnedSkillIds),
        ...(typeof raw.lastArchiveId === "string" && raw.lastArchiveId.trim()
          ? { lastArchiveId: raw.lastArchiveId.trim() }
          : {}),
        ...(typeof raw.keepLastMessages === "number" &&
        Number.isFinite(raw.keepLastMessages)
          ? { keepLastMessages: raw.keepLastMessages }
          : {}),
        ...(typeof raw.maxInputTokensApprox === "number" &&
        Number.isFinite(raw.maxInputTokensApprox)
          ? { maxInputTokensApprox: raw.maxInputTokensApprox }
          : {}),
      };
    } catch {
      return {
        v: 1,
        contextId: this.contextId,
        updatedAt: 0,
        pinnedSkillIds: [],
      };
    }
  }

  private async writeMetaUnsafe(
    next: ShipContextMessagesMetaV1,
  ): Promise<void> {
    const normalized: ShipContextMessagesMetaV1 = {
      v: 1,
      contextId: this.contextId,
      updatedAt:
        typeof next.updatedAt === "number" ? next.updatedAt : Date.now(),
      pinnedSkillIds: this.normalizePinnedSkillIds(next.pinnedSkillIds),
      ...(typeof next.lastArchiveId === "string" && next.lastArchiveId.trim()
        ? { lastArchiveId: next.lastArchiveId.trim() }
        : {}),
      ...(typeof next.keepLastMessages === "number" &&
      Number.isFinite(next.keepLastMessages)
        ? { keepLastMessages: next.keepLastMessages }
        : {}),
      ...(typeof next.maxInputTokensApprox === "number" &&
      Number.isFinite(next.maxInputTokensApprox)
        ? { maxInputTokensApprox: next.maxInputTokensApprox }
        : {}),
    };
    await fs.writeJson(this.getMetaFilePath(), normalized, { spaces: 2 });
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
            await logger.log("warn", "Removed stale context lock", {
              contextId: this.contextId,
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

  private normalizeSystem(system: SystemModelMessage[]): SystemModelMessage[] {
    if (!Array.isArray(system)) return [];
    return system.filter((item) => item && typeof item === "object");
  }

  private normalizeTools(tools: Record<string, Tool>): Record<string, Tool> {
    return tools && typeof tools === "object" ? { ...tools } : {};
  }

  private readUserModelMessageText(message: ModelMessage): string {
    if (!message || typeof message !== "object" || message.role !== "user") {
      return "";
    }
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const candidate = part as { type?: unknown; text?: unknown };
        if (candidate.type === "text" && typeof candidate.text === "string") {
          return candidate.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  private hasTrailingUserQuery(
    messages: ModelMessage[],
    query: string,
  ): boolean {
    const target = String(query || "").trim();
    if (!target) return true;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (!item || typeof item !== "object") continue;
      if (item.role !== "user") continue;
      return this.readUserModelMessageText(item) === target;
    }
    return false;
  }

  private async toModelMessages(params: {
    tools?: ToolSet;
  }): Promise<ModelMessage[]> {
    const msgs = await this.list();
    const sanitizedMessages = msgs
      .map((m) => {
        const parts = Array.isArray(m.parts)
          ? m.parts.filter((part) => part?.type === "text")
          : [];
        return {
          ...m,
          parts,
        };
      })
      .filter((m) => Array.isArray(m.parts) && m.parts.length > 0);

    const input: Array<Omit<ContextMessageV1, "id">> = sanitizedMessages.map(
      (m) => {
        const { id: _id, ...rest } = m;
        return rest;
      },
    );
    return await convertToModelMessages(input, {
      ...(params.tools ? { tools: params.tools } : {}),
      ignoreIncompleteToolCalls: true,
    });
  }

  async compact(input: PersistorCompactInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    return await compactContextMessageIfNeeded(
      {
        rootPath: this.rootPath,
        contextId: this.contextId,
        withWriteLock: (fn) => this.withWriteLock(fn),
        loadAll: () => this.list(),
        createSummaryMessage: ({ text, sourceRange }) => ({
          id: `a:${this.contextId}:${generateId()}`,
          role: "assistant",
          metadata: {
            v: 1,
            ts: Date.now(),
            contextId: this.contextId,
            source: "compact",
            kind: "summary",
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
      },
    );
  }

  async prepare(input: PersistorPrepareInput): Promise<ModelMessage[]> {
    const query = String(input.query || "").trim();
    const tools = this.normalizeTools(input.tools);

    let baseModelMessages = await this.toModelMessages({ tools });
    if (!Array.isArray(baseModelMessages) || baseModelMessages.length === 0) {
      baseModelMessages = query ? [{ role: "user", content: query }] : [];
    }
    if (query && !this.hasTrailingUserQuery(baseModelMessages, query)) {
      baseModelMessages = [
        ...baseModelMessages,
        { role: "user", content: query },
      ];
    }
    return baseModelMessages;
  }

  async append(message: ContextMessageV1): Promise<void> {
    await this.withWriteLock(async () => {
      await fs.appendFile(
        this.getMessagesFilePath(),
        JSON.stringify(message) + "\n",
        "utf8",
      );
    });
  }

  async list(): Promise<ContextMessageV1[]> {
    await this.ensureLayout();
    const file = this.getMessagesFilePath();
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const out: ContextMessageV1[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Partial<ContextMessageV1>;
        if (!obj || typeof obj !== "object") continue;
        const role = String(obj.role || "");
        if (role !== "user" && role !== "assistant") continue;
        if (!Array.isArray(obj.parts)) continue;
        out.push(obj as ContextMessageV1);
      } catch {
        // ignore invalid lines
      }
    }
    return out;
  }

  async slice(start: number, end: number): Promise<ContextMessageV1[]> {
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
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
  }): ContextMessageV1 {
    const { ts, ...metadata } = input.metadata;
    const md: ContextMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: "ingress",
      kind: "normal",
    };
    const id = input.id || `u:${this.contextId}:${generateId()}`;
    return {
      id,
      role: "user",
      metadata: md,
      parts: [{ type: "text", text: String(input.text ?? "") }],
    };
  }

  assistantText(input: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): ContextMessageV1 {
    const { ts, ...metadata } = input.metadata;
    const md: ContextMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: input.source || "egress",
      kind: input.kind || "normal",
    };
    const id = input.id || `a:${this.contextId}:${generateId()}`;
    return {
      id,
      role: "assistant",
      metadata: md,
      parts: [{ type: "text", text: String(input.text ?? "") }],
    };
  }
}
