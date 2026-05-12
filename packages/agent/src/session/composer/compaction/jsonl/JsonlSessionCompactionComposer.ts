/**
 * JsonlSessionCompactionComposer：默认上下文压缩 Composer。
 *
 * 关键点（中文）
 * - 只负责压缩参数策略（retry 越多，窗口越紧）。
 * - 真正的读写与 compact 执行交由 history Composer。
 */

import type { SessionCompactionInput } from "@session/composer/compaction/SessionCompactionComposer.js";
import { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";

type JsonlSessionCompactionComposerOptions = {
  keepLastMessages?: number;
  maxInputTokensApprox?: number;
  archiveOnCompact?: boolean;
  compactRatio?: number;
};

/**
 * JsonlSessionCompactionComposer 默认实现。
 */
export class JsonlSessionCompactionComposer extends SessionCompactionComposer {
  readonly name = "summary_compaction_composer";
  private readonly options: JsonlSessionCompactionComposerOptions;

  constructor(options?: JsonlSessionCompactionComposerOptions) {
    super();
    this.options = options || {};
  }

  private resolvePolicy(retryCount: number): {
    keepLastMessages: number;
    maxInputTokensApprox: number;
    archiveOnCompact: boolean;
    compactRatio: number;
  } {
    const baseKeepLastMessages =
      typeof this.options.keepLastMessages === "number"
        ? Math.max(6, Math.min(5000, Math.floor(this.options.keepLastMessages)))
        : 30;
    const baseMaxInputTokensApprox =
      typeof this.options.maxInputTokensApprox === "number"
        ? Math.max(2000, Math.min(200_000, Math.floor(this.options.maxInputTokensApprox)))
        : 128000;
    const retryFactor = Math.max(1, Math.pow(2, retryCount));
    const keepLastMessages = Math.max(6, Math.floor(baseKeepLastMessages / retryFactor));
    const maxInputTokensApprox = Math.max(
      2000,
      Math.floor(baseMaxInputTokensApprox / retryFactor),
    );
    const archiveOnCompact =
      this.options.archiveOnCompact === undefined
        ? true
        : Boolean(this.options.archiveOnCompact);
    const compactRatioRaw =
      typeof this.options.compactRatio === "number" &&
      Number.isFinite(this.options.compactRatio)
        ? this.options.compactRatio
        : 0.5;
    const compactRatio = Math.max(0.1, Math.min(0.9, compactRatioRaw));
    return {
      keepLastMessages,
      maxInputTokensApprox,
      archiveOnCompact,
      compactRatio,
    };
  }

  async run(input: SessionCompactionInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    const policy = this.resolvePolicy(input.retryCount);
    return await input.historyComposer.compact({
      model: input.model,
      system: input.system,
      keepLastMessages: policy.keepLastMessages,
      maxInputTokensApprox: policy.maxInputTokensApprox,
      archiveOnCompact: policy.archiveOnCompact,
      compactRatio: policy.compactRatio,
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
