/**
 * 基于单一 messages.jsonl 的 SessionMessage mutation store。
 *
 * 文件中每行是一条完整 mutation。消息快照通过 reducer 重放得到，不维护第二份文件。
 */

import fs from "fs-extra";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { generateId } from "@/utils/Id.js";
import { reduce_session_messages } from "@/session/recorder/SessionMessageReducer.js";
import type { SessionMessage } from "@/types/session/SessionMessage.js";
import type { SessionMessageMutation } from "@/types/session/SessionMessageMutation.js";

/** JSONL message store 构造参数。 */
export interface JsonlSessionMessageStoreOptions {
  /** 当前 session 标识。 */
  session_id: string;
  /** canonical messages.jsonl 的绝对路径。 */
  file_path: string;
}

/** Recorder 在锁内构造下一条 mutation 时可用的序列状态。 */
export interface SessionMessageCommitState {
  /** 下一条 mutation 应使用的提交顺序。 */
  commit_sequence: number;
  /** 下一条新消息应使用的线性顺序。 */
  message_sequence: number;
  /** 当前已重放的线性消息列表。 */
  messages: SessionMessage[];
}

/** 单一 JSONL mutation store。 */
export class JsonlSessionMessageStore {
  readonly session_id: string;
  private readonly messages_file_path: string;
  private readonly lock_file_path: string;

  constructor(options: JsonlSessionMessageStoreOptions) {
    this.session_id = String(options.session_id || "").trim();
    this.messages_file_path = path.resolve(options.file_path);
    this.lock_file_path = `${this.messages_file_path}.lock`;
    if (!this.session_id) {
      throw new Error("JsonlSessionMessageStore requires session_id");
    }
  }

  /** 创建空文件并校验已有 Mutation 可重放。 */
  async initialize(): Promise<void> {
    await this.ensure_layout();
    reduce_session_messages(await this.read_mutations_unsafe());
  }

  /** 读取全部合法 mutation；损坏行会带行号抛错，避免静默产生错误历史。 */
  async list_mutations(): Promise<SessionMessageMutation[]> {
    await this.ensure_layout();
    return await this.read_mutations_unsafe();
  }

  /** 重放全部 mutation，得到当前 canonical 消息列表。 */
  async list_messages(): Promise<SessionMessage[]> {
    return reduce_session_messages(await this.list_mutations());
  }

  /**
   * 在跨进程文件锁内计算并追加 mutation。
   * 发布动作必须由调用方在此 Promise 成功后执行。
   */
  async commit(
    build_mutation: (state: SessionMessageCommitState) => SessionMessageMutation,
  ): Promise<SessionMessageMutation> {
    return await this.with_write_lock(async () => {
      const mutations = await this.read_mutations_unsafe();
      const messages = reduce_session_messages(mutations);
      const mutation = build_mutation({
        commit_sequence:
          (mutations[mutations.length - 1]?.commit_sequence || 0) + 1,
        message_sequence:
          messages.reduce(
            (value, message) => Math.max(value, message.sequence + 1),
            1,
          ),
        messages,
      });
      await fs.appendFile(
        this.messages_file_path,
        `${JSON.stringify(mutation)}\n`,
        "utf8",
      );
      return mutation;
    });
  }

  private async ensure_layout(): Promise<void> {
    await fs.ensureDir(path.dirname(this.messages_file_path));
    await fs.ensureFile(this.messages_file_path);
  }

  private async read_mutations_unsafe(): Promise<SessionMessageMutation[]> {
    const raw = await fs.readFile(this.messages_file_path, "utf8").catch(() => "");
    const mutations: SessionMessageMutation[] = [];
    const lines = raw.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      try {
        const mutation = JSON.parse(line) as SessionMessageMutation;
        if (mutation.session_id !== this.session_id) {
          throw new Error("session_id mismatch");
        }
        mutations.push(mutation);
      } catch (error) {
        throw new Error(
          `Invalid session mutation at line ${String(index + 1)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return mutations;
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
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        try {
          const lock_stat = await stat(this.lock_file_path);
          if (Date.now() - lock_stat.mtimeMs > stale_ms) {
            await fs.remove(this.lock_file_path);
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() - started_at > stale_ms * 2) {
          throw new Error(`Session message lock timeout: ${this.lock_file_path}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    try {
      return await callback();
    } finally {
      try {
        if ((await readFile(this.lock_file_path, "utf8")).trim() === token) {
          await fs.remove(this.lock_file_path);
        }
      } catch {
        // 锁文件已被清理时无需额外处理。
      }
    }
  }
}
