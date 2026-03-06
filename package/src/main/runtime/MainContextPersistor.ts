/**
 * MainContextPersistor：main 层 ContextPersistor 落盘实现。
 *
 * 关键点（中文）
 * - persistor 自身直接负责消息与 meta 落盘。
 * - agent 只依赖 ContextPersistor 抽象，不感知具体文件结构。
 * - 通过 modules 组合 `history + compactor`，并统一处理并发写锁。
 */

import fs from "fs-extra";
import {
  open as openFile,
  readFile as readFileNative,
  stat as statNative,
} from "node:fs/promises";
import path from "node:path";
import {
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  type SystemModelMessage,
  type Tool,
  type ToolSet,
} from "ai";
import { generateId } from "@utils/Id.js";
import { getLogger } from "@utils/logger/Logger.js";
import {
  ContextPersistor,
  type PrepareRunMessagesInput,
} from "@main/agent/ContextPersistor.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { ShipContextMessagesMetaV1 } from "@main/types/ContextMessagesMeta.js";
import type { ContextPersistorPathOverrides } from "@main/types/ContextPersistor.js";
import type {
  MainContextCompactorModule,
  MainContextCompactorModuleConfig,
  MainContextHistoryModuleConfig,
  MainContextPersistorModules,
} from "@main/types/ContextModules.js";
import { defaultContextCompactorModule } from "@main/runtime/modules/DefaultContextCompactorModule.js";

type MainContextPersistorOptions = {
  rootPath: string;
  contextId: string;
  paths?: ContextPersistorPathOverrides;
  modules?: MainContextPersistorModules;
};

function getShipDirPath(rootPath: string): string {
  return path.join(rootPath, ".ship");
}

function getShipContextRootDirPath(rootPath: string): string {
  return path.join(getShipDirPath(rootPath), "context");
}

function getShipContextDirPath(rootPath: string, contextId: string): string {
  return path.join(getShipContextRootDirPath(rootPath), encodeURIComponent(contextId));
}

function getShipContextMessagesDirPath(rootPath: string, contextId: string): string {
  return path.join(getShipContextDirPath(rootPath, contextId), "messages");
}

export class MainContextPersistor extends ContextPersistor {
  readonly contextId: string;
  private readonly rootPath: string;
  private readonly overrideContextDirPath?: string;
  private readonly overrideMessagesDirPath?: string;
  private readonly overrideMessagesFilePath?: string;
  private readonly overrideMetaFilePath?: string;
  private readonly overrideArchiveDirPath?: string;
  private readonly historyModule: MainContextHistoryModuleConfig;
  private readonly compactorModule: MainContextCompactorModule;
  private readonly compactorModuleConfig: Omit<MainContextCompactorModuleConfig, "module">;

  constructor(options: MainContextPersistorOptions) {
    super();
    const rootPath = String(options.rootPath || "").trim();
    if (!rootPath) {
      throw new Error("MainContextPersistor requires a non-empty rootPath");
    }
    const contextId = String(options.contextId || "").trim();
    if (!contextId) {
      throw new Error("MainContextPersistor requires a non-empty contextId");
    }
    this.rootPath = rootPath;
    this.contextId = contextId;
    this.overrideContextDirPath = this.readOptionalPath(options.paths?.contextDirPath);
    this.overrideMessagesDirPath = this.readOptionalPath(options.paths?.messagesDirPath);
    this.overrideMessagesFilePath = this.readOptionalPath(options.paths?.messagesFilePath);
    this.overrideMetaFilePath = this.readOptionalPath(options.paths?.metaFilePath);
    this.overrideArchiveDirPath = this.readOptionalPath(options.paths?.archiveDirPath);
    this.historyModule = this.resolveHistoryModule(options.modules);
    this.compactorModule = this.resolveCompactorModule(options.modules);
    this.compactorModuleConfig = this.resolveCompactorModuleConfig(options.modules);
  }

  private resolveHistoryModule(
    modules: MainContextPersistorModules | undefined,
  ): MainContextHistoryModuleConfig {
    const driver = modules?.history?.driver ?? "jsonl-file";
    if (driver !== "jsonl-file") {
      throw new Error(
        `MainContextPersistor only supports history.driver="jsonl-file", got "${String(driver)}"`,
      );
    }
    return { driver };
  }

  private resolveCompactorModule(
    modules: MainContextPersistorModules | undefined,
  ): MainContextCompactorModule {
    const module = modules?.compactor?.module;
    if (module && typeof module.compactIfNeeded === "function") {
      return module;
    }
    return defaultContextCompactorModule;
  }

  private resolveCompactorModuleConfig(
    modules: MainContextPersistorModules | undefined,
  ): Omit<MainContextCompactorModuleConfig, "module"> {
    return {
      keepLastMessages: modules?.compactor?.keepLastMessages,
      maxInputTokensApprox: modules?.compactor?.maxInputTokensApprox,
      archiveOnCompact: modules?.compactor?.archiveOnCompact,
    };
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
      const raw = (await fs.readJson(file)) as Partial<ShipContextMessagesMetaV1> | null;
      if (!raw || typeof raw !== "object") throw new Error("invalid_meta");
      return {
        v: 1,
        contextId: this.contextId,
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
        pinnedSkillIds: this.normalizePinnedSkillIds(raw.pinnedSkillIds),
        ...(typeof raw.lastArchiveId === "string" && raw.lastArchiveId.trim()
          ? { lastArchiveId: raw.lastArchiveId.trim() }
          : {}),
        ...(typeof raw.keepLastMessages === "number" && Number.isFinite(raw.keepLastMessages)
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

  private async writeMetaUnsafe(next: ShipContextMessagesMetaV1): Promise<void> {
    const normalized: ShipContextMessagesMetaV1 = {
      v: 1,
      contextId: this.contextId,
      updatedAt: typeof next.updatedAt === "number" ? next.updatedAt : Date.now(),
      pinnedSkillIds: this.normalizePinnedSkillIds(next.pinnedSkillIds),
      ...(typeof next.lastArchiveId === "string" && next.lastArchiveId.trim()
        ? { lastArchiveId: next.lastArchiveId.trim() }
        : {}),
      ...(typeof next.keepLastMessages === "number" && Number.isFinite(next.keepLastMessages)
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

  private resolveCompactPolicy(retryAttempts: number): {
    keepLastMessages: number;
    maxInputTokensApprox: number;
    archiveOnCompact: boolean;
  } {
    const contextMessagesConfig = this.compactorModuleConfig;
    const baseKeepLastMessages =
      typeof contextMessagesConfig?.keepLastMessages === "number"
        ? Math.max(6, Math.min(5000, Math.floor(contextMessagesConfig.keepLastMessages)))
        : 30;
    const baseMaxInputTokensApprox =
      typeof contextMessagesConfig?.maxInputTokensApprox === "number"
        ? Math.max(2000, Math.min(200_000, Math.floor(contextMessagesConfig.maxInputTokensApprox)))
        : 128000;
    const retryFactor = Math.max(1, Math.pow(2, retryAttempts));
    const keepLastMessages = Math.max(6, Math.floor(baseKeepLastMessages / retryFactor));
    const maxInputTokensApprox = Math.max(
      2000,
      Math.floor(baseMaxInputTokensApprox / retryFactor),
    );
    const archiveOnCompact =
      contextMessagesConfig?.archiveOnCompact === undefined
        ? true
        : Boolean(contextMessagesConfig.archiveOnCompact);
    return { keepLastMessages, maxInputTokensApprox, archiveOnCompact };
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

  private hasTrailingUserQuery(messages: ModelMessage[], query: string): boolean {
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

  private async toModelMessages(params: { tools?: ToolSet }): Promise<ModelMessage[]> {
    const msgs = await this.loadAll();
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

    const input: Array<Omit<ContextMessageV1, "id">> = sanitizedMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });
    return await convertToModelMessages(input, {
      ...(params.tools ? { tools: params.tools } : {}),
      ignoreIncompleteToolCalls: true,
    });
  }

  async prepareRunMessages(input: PrepareRunMessagesInput): Promise<ModelMessage[]> {
    const query = String(input.query || "").trim();
    const model: LanguageModel = input.model;
    const tools = this.normalizeTools(input.tools);
    const system = this.normalizeSystem(input.system);
    const compactPolicy = this.resolveCompactPolicy(input.retryAttempts);
    void this.historyModule;

    try {
      await this.compactorModule.compactIfNeeded({
        rootPath: this.rootPath,
        contextId: this.contextId,
        withWriteLock: (fn) => this.withWriteLock(fn),
        loadAll: () => this.loadAll(),
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
        model,
        system,
        keepLastMessages: compactPolicy.keepLastMessages,
        maxInputTokensApprox: compactPolicy.maxInputTokensApprox,
        archiveOnCompact: compactPolicy.archiveOnCompact,
      });
    } catch {
      // ignore compact failure; fallback to un-compacted messages
    }

    let baseModelMessages = await this.toModelMessages({ tools });
    if (!Array.isArray(baseModelMessages) || baseModelMessages.length === 0) {
      baseModelMessages = query ? [{ role: "user", content: query }] : [];
    }
    if (query && !this.hasTrailingUserQuery(baseModelMessages, query)) {
      baseModelMessages = [...baseModelMessages, { role: "user", content: query }];
    }
    return baseModelMessages;
  }

  async append(message: ContextMessageV1): Promise<void> {
    await this.withWriteLock(async () => {
      await fs.appendFile(this.getMessagesFilePath(), JSON.stringify(message) + "\n", "utf8");
    });
  }

  async loadAll(): Promise<ContextMessageV1[]> {
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

  async loadRange(startIndex: number, endIndex: number): Promise<ContextMessageV1[]> {
    const msgs = await this.loadAll();
    const start = Math.max(0, Math.floor(startIndex));
    const end = Math.max(start, Math.floor(endIndex));
    return msgs.slice(start, end);
  }

  async getTotalMessageCount(): Promise<number> {
    const msgs = await this.loadAll();
    return msgs.length;
  }

  async loadMeta(): Promise<Record<string, unknown>> {
    await this.ensureLayout();
    const meta = await this.readMetaUnsafe();
    return (meta && typeof meta === "object" ? { ...meta } : {}) as Record<string, unknown>;
  }

  createUserTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
  }): ContextMessageV1 {
    const { ts, ...metadata } = params.metadata;
    const md: ContextMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: "ingress",
      kind: "normal",
    };
    const id = params.id || `u:${this.contextId}:${generateId()}`;
    return {
      id,
      role: "user",
      metadata: md,
      parts: [{ type: "text", text: String(params.text ?? "") }],
    };
  }

  createAssistantTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): ContextMessageV1 {
    const { ts, ...metadata } = params.metadata;
    const md: ContextMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: params.source || "egress",
      kind: params.kind || "normal",
    };
    const id = params.id || `a:${this.contextId}:${generateId()}`;
    return {
      id,
      role: "assistant",
      metadata: md,
      parts: [{ type: "text", text: String(params.text ?? "") }],
    };
  }
}
