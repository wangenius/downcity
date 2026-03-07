/**
 * SummaryCompactor：默认上下文压缩策略组件。
 *
 * 关键点（中文）
 * - 只负责压缩参数策略（retry 越多，窗口越紧）。
 * - 真正的读写与 compact 执行交由 persistor。
 */

import type { CompactorRunInput } from "@main/agent/components/CompactorComponent.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";

type SummaryCompactorOptions = {
  keepLastMessages?: number;
  maxInputTokensApprox?: number;
  archiveOnCompact?: boolean;
  compactRatio?: number;
};

/**
 * SummaryCompactor 默认实现。
 */
export class SummaryCompactor extends CompactorComponent {
  readonly name = "summary_compactor";
  private readonly options: SummaryCompactorOptions;

  constructor(options?: SummaryCompactorOptions) {
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

  async run(input: CompactorRunInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    const policy = this.resolvePolicy(input.retryCount);
    return await input.persistor.compact({
      model: input.model,
      system: input.system,
      keepLastMessages: policy.keepLastMessages,
      maxInputTokensApprox: policy.maxInputTokensApprox,
      archiveOnCompact: policy.archiveOnCompact,
      compactRatio: policy.compactRatio,
    });
  }
}
