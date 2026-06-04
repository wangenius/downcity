/**
 * ExecutorInflightService：运行中 assistant 快照写入服务。
 *
 * 关键点（中文）
 * - 只负责把 step/tool 增量写入当前 inflight assistant 快照。
 * - 不负责长期 history 组装，不负责主执行循环。
 * - 保持与 SessionHistoryStore 的交互边界清晰，避免 Executor 自身同时承担编排与写入细节。
 */

import { generateId } from "@/utils/Id.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";

interface ExecutorInflightServiceOptions {
  /**
   * 当前 session 标识。
   */
  session_id: string;

  /**
   * 当前 session 对应的 history 事实源。
   */
  history_store: SessionHistoryStore;

  /**
   * inflight 更新完成后的异步通知。
   */
  run_after_session_updated_async?: () => Promise<void>;
}

/**
 * 运行中 assistant 快照写入服务。
 */
export class ExecutorInflightService {
  private readonly session_id: string;
  private readonly history_store: SessionHistoryStore;
  private readonly run_after_session_updated_async?: ExecutorInflightServiceOptions["run_after_session_updated_async"];

  constructor(options: ExecutorInflightServiceOptions) {
    this.session_id = String(options.session_id || "").trim();
    this.history_store = options.history_store;
    this.run_after_session_updated_async =
      options.run_after_session_updated_async;

    if (!this.session_id) {
      throw new Error("ExecutorInflightService requires a non-empty session_id");
    }
  }

  /**
   * 把 step/tool 过程增量写入当前运行中的 assistant 快照。
   */
  async append_assistant_step_parts(
    parts: SessionMessageV1["parts"],
  ): Promise<void> {
    const normalized_parts = Array.isArray(parts)
      ? parts.filter((part) => part && typeof part === "object")
      : [];
    if (normalized_parts.length === 0) return;

    const current_inflight = await this.history_store.readInflight();
    const next_message: SessionMessageV1 = current_inflight
      ? {
          ...current_inflight,
          metadata: {
            ...(current_inflight.metadata || {
              v: 1 as const,
              ts: Date.now(),
              sessionId: this.session_id,
            }),
            ts: Date.now(),
            sessionId: this.session_id,
            source: "egress",
            kind: "normal",
          },
          parts: [
            ...(Array.isArray(current_inflight.parts)
              ? current_inflight.parts
              : []),
            ...normalized_parts,
          ],
        }
      : {
          id: `a:${this.session_id}:${generateId()}`,
          role: "assistant",
          metadata: {
            v: 1,
            ts: Date.now(),
            sessionId: this.session_id,
            source: "egress",
            kind: "normal",
          },
          parts: normalized_parts,
        };

    await this.history_store.writeInflight(next_message);
    if (this.run_after_session_updated_async) {
      await this.run_after_session_updated_async();
    }
  }
}
