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

type JsonlSessionCompactionComposerOptions = {
  keepLastMessages?: number;
  maxInputTokensApprox?: number;
  compactRatio?: number;
};

/**
 * JsonlSessionCompactionComposer 默认实现。
 */
export class JsonlSessionCompactionComposer implements SessionCompactionComposer {
  readonly name = "summary_compaction_composer";
  private readonly options: JsonlSessionCompactionComposerOptions;

  constructor(options?: JsonlSessionCompactionComposerOptions) {
    this.options = options || {};
  }

  private resolvePolicy(retryCount: number, context_window?: number): {
    keepLastMessages: number;
    maxInputTokensApprox: number;
    compactRatio: number;
  } {
    const baseKeepLastMessages =
      typeof this.options.keepLastMessages === "number"
        ? Math.max(6, Math.min(5000, Math.floor(this.options.keepLastMessages)))
        : 30;
    const configured_max_input_tokens =
      typeof this.options.maxInputTokensApprox === "number"
        && Number.isFinite(this.options.maxInputTokensApprox)
        ? Math.max(2000, Math.floor(this.options.maxInputTokensApprox))
        : undefined;
    const model_context_window =
      Number.isSafeInteger(context_window) && Number(context_window) > 0
        ? Number(context_window)
        : undefined;
    const baseMaxInputTokensApprox = configured_max_input_tokens
      ?? (model_context_window !== undefined
        ? Math.max(1, Math.floor(model_context_window * 0.8))
        : 128000);
    const retryFactor = Math.max(1, Math.pow(2, retryCount));
    const keepLastMessages = Math.max(6, Math.floor(baseKeepLastMessages / retryFactor));
    const minimum_input_tokens = Math.min(2000, baseMaxInputTokensApprox);
    const maxInputTokensApprox = Math.max(
      minimum_input_tokens,
      Math.floor(baseMaxInputTokensApprox / retryFactor),
    );
    const compactRatioRaw =
      typeof this.options.compactRatio === "number" &&
      Number.isFinite(this.options.compactRatio)
        ? this.options.compactRatio
        : 0.5;
    const compactRatio = Math.max(0.1, Math.min(0.9, compactRatioRaw));
    return {
      keepLastMessages,
      maxInputTokensApprox,
      compactRatio,
    };
  }

  async run(input: SessionCompactionInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    const policy = this.resolvePolicy(input.retryCount, input.context_window);
    return await input.historyStore.compact({
      model: input.model,
      system: input.system,
      keepLastMessages: policy.keepLastMessages,
      maxInputTokensApprox: policy.maxInputTokensApprox,
      compactRatio: policy.compactRatio,
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
