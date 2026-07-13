/**
 * JsonlSessionCompactionComposer：默认上下文压缩 Composer。
 *
 * 关键点（中文）
 * - 只负责压缩参数策略（retry 越多，窗口越紧）。
 * - 真正的读写与 compact 执行交由 history Store。
 */

import type {
  SessionCompactionComposer,
  SessionCompactionInput,
} from "@executor/composer/compaction/SessionCompactionComposer.js";

/**
 * JsonlSessionCompactionComposer 默认实现。
 */
export class JsonlSessionCompactionComposer implements SessionCompactionComposer {
  readonly name = "summary_compaction_composer";

  async run(input: SessionCompactionInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    if (!input.force && input.retryCount <= 0) {
      return { compacted: false, reason: "not_requested" };
    }
    return await input.historyStore.compact({
      model: input.model,
      system: input.system,
      force: true,
      ...(input.onAction ? { onAction: input.onAction } : {}),
    });
  }

  /**
   * 判断错误是否属于“应先 compact 再重试”的类型。
   *
   * 关键点（中文）
   * - 当前实现基于主流模型 provider 的超限关键词。
   * - 后续若接入新 provider，可在此处统一扩展识别规则。
   */
  shouldCompactOnError(error: unknown): boolean {
    const errorMsg = String(error ?? "");
    return (
      errorMsg.includes("context_length") ||
      errorMsg.includes("too long") ||
      errorMsg.includes("maximum context") ||
      errorMsg.includes("context window")
    );
  }
}
