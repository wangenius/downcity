/**
 * 默认 Context compactor 模块。
 *
 * 关键点（中文）
 * - 保持现有 compact 行为不变（基于 `Compact.ts`）。
 * - 通过模块注入为后续替换算法预留稳定扩展点。
 */

import { compactContextMessageIfNeeded } from "@main/agent/Compact.js";
import type {
  MainContextCompactorModule,
  MainContextCompactorModuleInput,
} from "@main/types/ContextModules.js";

async function compactUsingBuiltin(
  input: MainContextCompactorModuleInput,
): Promise<{ compacted: boolean; reason?: string }> {
  return await compactContextMessageIfNeeded(
    {
      rootPath: input.rootPath,
      contextId: input.contextId,
      withWriteLock: input.withWriteLock,
      loadAll: input.loadAll,
      createSummaryMessage: input.createSummaryMessage,
      getArchiveDirPath: input.getArchiveDirPath,
      getMessagesFilePath: input.getMessagesFilePath,
      readMetaUnsafe: input.readMetaUnsafe,
      writeMetaUnsafe: input.writeMetaUnsafe,
    },
    {
      model: input.model,
      system: input.system,
      keepLastMessages: input.keepLastMessages,
      maxInputTokensApprox: input.maxInputTokensApprox,
      archiveOnCompact: input.archiveOnCompact,
    },
  );
}

/**
 * 默认 compactor 模块实例。
 */
export const defaultContextCompactorModule: MainContextCompactorModule = {
  name: "builtin-llm-summary",
  compactIfNeeded: compactUsingBuiltin,
};
