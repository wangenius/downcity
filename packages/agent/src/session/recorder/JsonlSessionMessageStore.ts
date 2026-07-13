/**
 * SessionMessage 的 JSONL 快照存储。
 *
 * messages.jsonl 只保存完整 Message 快照；运行中的唯一 Assistant 使用
 * assistant_message.json 原子覆盖，避免把每个 delta 写入历史文件。
 */

import fs from "fs-extra";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { generateId } from "@/utils/Id.js";
import type { SessionAssistantMessage, SessionMessage } from "@/types/session/SessionMessage.js";

/** JSONL 快照存储构造参数。 */
export interface JsonlSessionMessageStoreOptions {
  /** 当前 Session 标识。 */
  session_id: string;
  /** messages.jsonl 的绝对或相对路径。 */
  file_path: string;
  /** Assistant 运行中快照路径，默认与 messages.jsonl 同目录。 */
  assistant_message_file_path?: string;
}

/** 在写锁内计算新 Message 所需的状态。 */
export interface SessionMessageCommitState {
  /** 下一条新 Message 的线性顺序。 */
  message_sequence: number;
  /** 当前已持久化的完整 Message 快照。 */
  messages: SessionMessage[];
}

/** 单一 JSONL 快照存储。 */
export class JsonlSessionMessageStore {
  readonly session_id: string;
  readonly messages_file_path: string;
  readonly assistant_message_file_path: string;
  private readonly lock_file_path: string;

  constructor(options: JsonlSessionMessageStoreOptions) {
    this.session_id = String(options.session_id || "").trim();
    this.messages_file_path = path.resolve(options.file_path);
    this.assistant_message_file_path = path.resolve(
      options.assistant_message_file_path ||
        path.join(path.dirname(this.messages_file_path), "assistant_message.json"),
    );
    this.lock_file_path = `${this.messages_file_path}.lock`;
    if (!this.session_id) throw new Error("JsonlSessionMessageStore requires session_id");
  }

  /** 创建目录和文件，并验证已有快照。 */
  async initialize(): Promise<void> {
    await this.ensure_layout();
    const messages = await this.read_messages_unsafe();
    const draft = await this.read_assistant_message();
    if (draft && draft.session_id !== this.session_id) {
      throw new Error("assistant_message.json session_id mismatch");
    }
    const finalized = draft && messages.find((message) => message.message_id === draft.message_id);
    if (draft && finalized && finalized.revision >= draft.revision && finalized.type === "assistant" && finalized.status !== "streaming") {
      await fs.remove(this.assistant_message_file_path);
    }
  }

  /** 读取 JSONL 中每一行完整快照，并按 Message revision 折叠。 */
  async list_messages(): Promise<SessionMessage[]> {
    await this.ensure_layout();
    const by_id = new Map<string, SessionMessage>();
    const raw = await fs.readFile(this.messages_file_path, "utf8").catch(() => "");
    for (const [index, line] of raw.split("\n").entries()) {
      const value = line.trim();
      if (!value) continue;
      try {
        const message = JSON.parse(value) as SessionMessage;
        this.validate_message(message);
        const previous = by_id.get(message.message_id);
        if (!previous || message.revision > previous.revision) by_id.set(message.message_id, message);
      } catch (error) {
        throw new Error(`Invalid session message at line ${String(index + 1)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const draft = await this.read_assistant_message();
    if (draft) {
      const previous = by_id.get(draft.message_id);
      if (!previous || draft.revision > previous.revision) by_id.set(draft.message_id, draft);
    }
    return [...by_id.values()].sort((left, right) => left.sequence - right.sequence);
  }

  /** 读取当前运行中的 Assistant 草稿。 */
  async read_assistant_message(): Promise<SessionAssistantMessage | null> {
    try {
      const value = await fs.readJson(this.assistant_message_file_path) as SessionAssistantMessage;
      this.validate_message(value);
      if (value.type !== "assistant" || value.status !== "streaming") return null;
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof SyntaxError) throw error;
      throw error;
    }
  }

  /** 原子覆盖运行中的 Assistant 草稿。 */
  async write_assistant_message(message: SessionAssistantMessage): Promise<void> {
    this.validate_message(message);
    if (message.status !== "streaming") throw new Error("Assistant draft must be streaming");
    await this.with_write_lock(async () => {
      const current = await this.read_assistant_message();
      if (!current || current.message_id !== message.message_id) {
        throw new Error(`Assistant draft does not exist: ${message.message_id}`);
      }
      if (message.revision !== current.revision + 1) {
        throw new Error(`Invalid Assistant draft revision: ${message.message_id}`);
      }
      await this.write_assistant_message_unsafe(message);
    });
  }

  /** 在写锁内分配 Message sequence 并创建唯一 Assistant 草稿。 */
  async create_assistant_message(
    build_message: (state: SessionMessageCommitState) => SessionAssistantMessage,
  ): Promise<SessionAssistantMessage> {
    return await this.with_write_lock(async () => {
      const current = await this.read_assistant_message();
      if (current) throw new Error(`Assistant draft already exists: ${current.message_id}`);
      const messages = await this.read_messages_unsafe();
      const message = build_message({
        message_sequence: messages.reduce((max, item) => Math.max(max, item.sequence + 1), 1),
        messages,
      });
      this.validate_message(message);
      if (message.status !== "streaming" || message.revision !== 1) {
        throw new Error("New Assistant draft must be streaming at revision 1");
      }
      await this.write_assistant_message_unsafe(message);
      return message;
    });
  }

  /** 创建新 Message 或追加已有 Message revision 快照。 */
  async append_message(
    build_message: (state: SessionMessageCommitState) => SessionMessage,
  ): Promise<SessionMessage> {
    return await this.with_write_lock(async () => {
      const messages = await this.read_messages_unsafe();
      const draft = await this.read_assistant_message();
      const current_messages = draft ? [...messages, draft] : messages;
      const message = build_message({
        message_sequence: current_messages.reduce((max, item) => Math.max(max, item.sequence + 1), 1),
        messages: current_messages,
      });
      this.validate_message(message);
      await fs.appendFile(this.messages_file_path, `${JSON.stringify(message)}\n`, "utf8");
      return message;
    });
  }

  /** 将 Assistant 草稿最终追加为历史快照，并删除草稿文件。 */
  async finalize_assistant_message(message: SessionAssistantMessage): Promise<void> {
    this.validate_message(message);
    if (message.status === "streaming") throw new Error("Final Assistant message cannot be streaming");
    await this.with_write_lock(async () => {
      const current = await this.read_assistant_message();
      if (!current || current.message_id !== message.message_id) {
        throw new Error(`Assistant draft does not exist: ${message.message_id}`);
      }
      if (message.revision !== current.revision + 1) {
        throw new Error(`Invalid final Assistant revision: ${message.message_id}`);
      }
      await fs.appendFile(this.messages_file_path, `${JSON.stringify(message)}\n`, "utf8");
      await fs.remove(this.assistant_message_file_path);
    });
  }

  private async read_messages_unsafe(): Promise<SessionMessage[]> {
    const raw = await fs.readFile(this.messages_file_path, "utf8").catch(() => "");
    const by_id = new Map<string, SessionMessage>();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as SessionMessage;
      this.validate_message(message);
      const previous = by_id.get(message.message_id);
      if (!previous || message.revision > previous.revision) by_id.set(message.message_id, message);
    }
    return [...by_id.values()].sort((left, right) => left.sequence - right.sequence);
  }

  private async write_assistant_message_unsafe(message: SessionAssistantMessage): Promise<void> {
    const temporary_path = `${this.assistant_message_file_path}.${process.pid}.${Date.now()}.tmp`;
    await fs.ensureDir(path.dirname(this.assistant_message_file_path));
    await fs.writeJson(temporary_path, message, { spaces: 2 });
    await fs.move(temporary_path, this.assistant_message_file_path, { overwrite: true });
  }

  private validate_message(message: SessionMessage): void {
    if (!message || typeof message !== "object") throw new Error("message must be an object");
    if (message.session_id !== this.session_id) throw new Error("session_id mismatch");
    if (!message.message_id || !Number.isInteger(message.sequence) || !Number.isInteger(message.revision)) {
      throw new Error("message identity, sequence and revision are required");
    }
    if (message.type === "assistant") {
      const sequences = new Set<number>();
      for (const part of message.parts) {
        if (!Number.isInteger(part.sequence) || sequences.has(part.sequence)) {
          throw new Error(`invalid Assistant part sequence: ${part.part_id}`);
        }
        sequences.add(part.sequence);
      }
    }
  }

  private async ensure_layout(): Promise<void> {
    await fs.ensureDir(path.dirname(this.messages_file_path));
    await fs.ensureFile(this.messages_file_path);
  }

  private async with_write_lock<T>(callback: () => Promise<T>): Promise<T> {
    await this.ensure_layout();
    const token = `${process.pid}:${Date.now()}:${generateId()}`;
    const stale_ms = 30_000;
    const started_at = Date.now();
    while (true) {
      try {
        const file = await open(this.lock_file_path, "wx");
        await file.writeFile(token, "utf8");
        await file.close();
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const lock_stat = await stat(this.lock_file_path);
          if (Date.now() - lock_stat.mtimeMs > stale_ms) await fs.remove(this.lock_file_path);
        } catch { /* 锁文件可能刚被释放。 */ }
        if (Date.now() - started_at > stale_ms * 2) throw new Error(`Session message lock timeout: ${this.lock_file_path}`);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    try {
      return await callback();
    } finally {
      try {
        if ((await readFile(this.lock_file_path, "utf8")).trim() === token) await fs.remove(this.lock_file_path);
      } catch { /* 锁已被清理。 */ }
    }
  }
}
