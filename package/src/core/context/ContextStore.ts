/**
 * Context 存储模块。
 *
 * 关键点（中文）
 * - 基于 JSONL 持久化 UIMessage。
 * - 通过文件锁协调 append 与 compact 的并发写入。
 * - 提供 meta/archive 以支持可审计的上下文压缩。
 */

import fs from "fs-extra";
import { open as openFile, readFile as readFileNative, stat as statNative } from "node:fs/promises";
import path from "node:path";
import {
  convertToModelMessages,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { generateId } from "@utils/Id.js";
import type { ContextMetadataV1, ContextMessageV1 } from "@core/types/ContextMessage.js";
import type { ShipContextMessagesMetaV1 } from "@core/types/ContextMessagesMeta.js";
import type { ContextStorePathOverrides } from "@core/types/ContextStore.js";
import { getLogger } from "@utils/logger/Logger.js";

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

function getShipContextMessagesPath(rootPath: string, contextId: string): string {
  return path.join(getShipContextMessagesDirPath(rootPath, contextId), "messages.jsonl");
}

function getShipContextMessagesMetaPath(rootPath: string, contextId: string): string {
  return path.join(getShipContextMessagesDirPath(rootPath, contextId), "meta.json");
}

function getShipContextMessagesArchiveDirPath(
  rootPath: string,
  contextId: string,
): string {
  return path.join(getShipContextMessagesDirPath(rootPath, contextId), "archive");
}

/**
 * ContextStore：基于 UIMessage 的会话上下文存储（per contextId）。
 *
 * 设计目标（中文）
 * - 单一事实源：UI 展示 + 模型 messages 使用同一份 UIMessage[] 数据
 * - 可 compact：超出上下文窗口时，自动把更早消息段压缩为 1 条摘要消息
 * - 可审计：compact 前的原始段写入 archive（可选，但推荐默认开启）
 *
 * 落盘结构
 * - `.ship/context/<encodedContextId>/messages/messages.jsonl`：每行一个 UIMessage（append + compact 时 rewrite）
 * - `.ship/context/<encodedContextId>/messages/meta.json`：compact 元数据
 * - `.ship/context/<encodedContextId>/messages/archive/<archiveId>.json`：compact 归档段
 */
export class ContextStore {
  readonly rootPath: string;
  readonly contextId: string;
  private readonly overrideContextDirPath?: string;
  private readonly overrideMessagesDirPath?: string;
  private readonly overrideMessagesFilePath?: string;
  private readonly overrideMetaFilePath?: string;
  private readonly overrideArchiveDirPath?: string;

  constructor(params: {
    rootPath: string;
    contextId: string;
    paths?: ContextStorePathOverrides;
  }) {
    const rootPath = String(params.rootPath || "").trim();
    if (!rootPath) throw new Error("ContextStore requires a non-empty rootPath");
    const key = String(params.contextId || "").trim();
    if (!key) throw new Error("ContextStore requires a non-empty contextId");
    this.rootPath = rootPath;
    this.contextId = key;
    const options = params.paths;
    this.overrideContextDirPath =
      options?.contextDirPath && String(options.contextDirPath).trim()
        ? String(options.contextDirPath).trim()
        : undefined;
    this.overrideMessagesDirPath =
      options?.messagesDirPath && String(options.messagesDirPath).trim()
        ? String(options.messagesDirPath).trim()
        : undefined;
    this.overrideMessagesFilePath =
      options?.messagesFilePath && String(options.messagesFilePath).trim()
        ? String(options.messagesFilePath).trim()
        : undefined;
    this.overrideMetaFilePath =
      options?.metaFilePath && String(options.metaFilePath).trim()
        ? String(options.metaFilePath).trim()
        : undefined;
    this.overrideArchiveDirPath =
      options?.archiveDirPath && String(options.archiveDirPath).trim()
        ? String(options.archiveDirPath).trim()
        : undefined;
  }

  /**
   * 获取 context 目录路径。
   */
  getContextDirPath(): string {
    if (this.overrideContextDirPath) return this.overrideContextDirPath;
    return getShipContextDirPath(this.rootPath, this.contextId);
  }

  /**
   * 获取 messages 目录路径。
   */
  getMessagesDirPath(): string {
    if (this.overrideMessagesDirPath) return this.overrideMessagesDirPath;
    return getShipContextMessagesDirPath(this.rootPath, this.contextId);
  }

  /**
   * 获取 messages.jsonl 路径。
   */
  getMessagesFilePath(): string {
    if (this.overrideMessagesFilePath) return this.overrideMessagesFilePath;
    if (this.overrideMessagesDirPath) {
      // 关键点（中文）：task run 等自定义 layout 默认也遵循 `messages.jsonl` 命名。
      return path.join(this.overrideMessagesDirPath, "messages.jsonl");
    }
    return getShipContextMessagesPath(this.rootPath, this.contextId);
  }

  /**
   * 获取 meta.json 路径。
   */
  getMetaFilePath(): string {
    if (this.overrideMetaFilePath) return this.overrideMetaFilePath;
    if (this.overrideMessagesDirPath) return path.join(this.overrideMessagesDirPath, "meta.json");
    return getShipContextMessagesMetaPath(this.rootPath, this.contextId);
  }

  /**
   * 获取 archive 目录路径。
   */
  getArchiveDirPath(): string {
    if (this.overrideArchiveDirPath) return this.overrideArchiveDirPath;
    if (this.overrideMessagesDirPath) return path.join(this.overrideMessagesDirPath, "archive");
    return getShipContextMessagesArchiveDirPath(this.rootPath, this.contextId);
  }

  /**
   * 获取 context 写锁文件路径。
   */
  private getLockFilePath(): string {
    return path.join(this.getMessagesDirPath(), ".context.lock");
  }

  /**
   * 确保 messages/meta/archive 的目录与文件存在。
   */
  private async ensureLayout(): Promise<void> {
    await fs.ensureDir(this.getMessagesDirPath());
    await fs.ensureDir(this.getArchiveDirPath());
    await fs.ensureFile(this.getMessagesFilePath());
  }

  /**
   * 归一化 pinnedSkillIds。
   *
   * - 仅保留非空字符串；去重并限制上限，避免 meta 异常膨胀。
   */
  private normalizePinnedSkillIds(input: string[] | undefined): string[] {
    if (!Array.isArray(input)) return [];
    const out: string[] = [];
    for (const v of input) {
      const id = typeof v === "string" ? v.trim() : "";
      if (!id) continue;
      out.push(id);
    }
    // 去重 + 稳定顺序
    return Array.from(new Set(out)).slice(0, 2000);
  }

  /**
   * 读取 meta（不加锁）。
   *
   * - 仅在已持锁或只读场景使用；解析失败回退默认值。
   * - 对外暴露用于 compact 模块直连调用（避免在 Store 再包一层）。
   */
  async readMetaUnsafe(): Promise<ShipContextMessagesMetaV1> {
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
        ...(typeof raw.maxInputTokensApprox === "number" && Number.isFinite(raw.maxInputTokensApprox)
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

  /**
   * 读取 contextId 的 messages meta（不存在则返回默认值）。
   */
  async loadMeta(): Promise<ShipContextMessagesMetaV1> {
    await this.ensureLayout();
    return await this.readMetaUnsafe();
  }

  /**
   * 写入 meta（不加锁）。
   *
   * - 调用方需自行保证并发安全（通常通过 `withWriteLock`）。
   * - 对外暴露用于 compact 模块直连调用（避免在 Store 再包一层）。
   */
  async writeMetaUnsafe(next: ShipContextMessagesMetaV1): Promise<void> {
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
      ...(typeof next.maxInputTokensApprox === "number" && Number.isFinite(next.maxInputTokensApprox)
        ? { maxInputTokensApprox: next.maxInputTokensApprox }
        : {}),
    };
    await fs.writeJson(this.getMetaFilePath(), normalized, { spaces: 2 });
  }

  /**
   * 合并更新 meta（用于 pin skills / compact 写入等）。
   */
  async updateMeta(patch: Partial<ShipContextMessagesMetaV1>): Promise<ShipContextMessagesMetaV1> {
    return await this.withWriteLock(async () => {
      const prev = await this.readMetaUnsafe();
      const next: ShipContextMessagesMetaV1 = {
        ...prev,
        ...patch,
        v: 1,
        contextId: this.contextId,
        updatedAt: Date.now(),
        pinnedSkillIds: this.normalizePinnedSkillIds(
          patch.pinnedSkillIds ?? prev.pinnedSkillIds,
        ),
      };
      await this.writeMetaUnsafe(next);
      return next;
    });
  }

  /**
   * pin 一个 skill id（持久化到 meta；后续 run 自动注入）。
   */
  async addPinnedSkillId(skillId: string): Promise<void> {
    const id = String(skillId || "").trim();
    if (!id) return;
    await this.withWriteLock(async () => {
      const prev = await this.readMetaUnsafe();
      const nextIds = Array.from(new Set([...(prev.pinnedSkillIds || []), id]));
      await this.writeMetaUnsafe({
        ...prev,
        updatedAt: Date.now(),
        pinnedSkillIds: nextIds,
      });
    });
  }

  /**
   * 覆盖设置 pinned skills（用于 compact 时自动清理）。
   */
  async setPinnedSkillIds(skillIds: string[]): Promise<void> {
    await this.updateMeta({
      pinnedSkillIds: Array.isArray(skillIds) ? skillIds : [],
    });
  }

  /**
   * 带文件锁的写操作包装。
   *
   * 算法说明（中文）
   * - 使用 `open(lock, "wx")` 实现原子抢锁（文件存在则失败）。
   * - 锁文件写入 token，释放时校验 token，避免误删他人锁。
   * - 过期锁（stale）会被清理，防止进程异常退出后永久阻塞。
   * - 对外暴露用于 compact 模块直连调用（避免在 Store 再包一层）。
   */
  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureLayout();
    const lockPath = this.getLockFilePath();
    const token = `${process.pid}:${Date.now()}:${generateId()}`;
    const logger = getLogger(this.rootPath, "info");

    // 关键点（中文）：这是单进程/单机的 best-effort 文件锁，避免 compact 与 append 互相覆盖导致丢消息。
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
        await new Promise((r) => setTimeout(r, 60));
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

  /**
   * 追加一条 UIMessage 到 messages.jsonl。
   *
   * 关键点（中文）
   * - append 看起来是简单写入，但仍需与 compact 共享同一把锁。
   * - 否则 compact rewrite 与 append 并发会造成丢行/覆盖。
   */
  async append(message: ContextMessageV1): Promise<void> {
    await this.withWriteLock(async () => {
      await fs.appendFile(this.getMessagesFilePath(), JSON.stringify(message) + "\n", "utf8");
    });
  }

  /**
   * 读取并解析全部历史。
   *
   * 关键点（中文）
   * - 只接收 role=user|assistant 且 parts 合法的行。
   * - 非法 JSON 行采用容错跳过，避免单行损坏导致整体不可读。
   */
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

  /**
   * 获取当前历史消息总数。
   */
  async getTotalMessageCount(): Promise<number> {
    const msgs = await this.loadAll();
    return msgs.length;
  }

  /**
   * 读取历史子区间（[startIndex, endIndex)）。
   *
   * 关键点（中文）
   * - 统一做 floor + 边界裁剪，保证调用方传异常值也不会抛错。
   */
  async loadRange(startIndex: number, endIndex: number): Promise<ContextMessageV1[]> {
    const msgs = await this.loadAll();
    const start = Math.max(0, Math.floor(startIndex));
    const end = Math.max(start, Math.floor(endIndex));
    return msgs.slice(start, end);
  }

  /**
   * 构造 user 文本消息（UIMessage 结构）。
   */
  createUserTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> & Partial<Pick<ContextMetadataV1, "ts">>;
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

  /**
   * 构造 assistant 文本消息（可标记 normal/summary 与 source）。
   */
  createAssistantTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> & Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
    sourceRange?: ContextMetadataV1["sourceRange"];
  }): ContextMessageV1 {
    const { ts, ...metadata } = params.metadata;
    const md: ContextMetadataV1 = {
      v: 1,
      ts: typeof ts === "number" ? ts : Date.now(),
      ...metadata,
      source: params.source || "egress",
      kind: params.kind || "normal",
      ...(params.sourceRange ? { sourceRange: params.sourceRange } : {}),
    };
    const id = params.id || `a:${this.contextId}:${generateId()}`;
    return {
      id,
      role: "assistant",
      metadata: md,
      parts: [{ type: "text", text: String(params.text ?? "") }],
    };
  }

  /**
   * 转换为模型输入 messages。
   *
   * 关键点（中文）
  * - 去掉 UIMessage 的 id 字段，仅保留模型可消费结构。
  * - `ignoreIncompleteToolCalls=true` 以容忍中断场景下的半成品 tool 记录。
  */
  async toModelMessages(params: { tools?: ToolSet }): Promise<ModelMessage[]> {
    const msgs = await this.loadAll();
    // 关键点（中文）：仅保留 text part，避免把历史 tool-call/tool-result 重放到 responses 导致引用链断裂。
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

    // convertToModelMessages 需要的是“没有 id 的 UIMessage”
    const input: Array<Omit<ContextMessageV1, "id">> = sanitizedMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });
    return await convertToModelMessages(input, {
      ...(params.tools ? { tools: params.tools } : {}),
      ignoreIncompleteToolCalls: true,
    });
  }
}
