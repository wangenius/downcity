import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { LanguageModel } from "ai";
import { getLogger } from "@utils/logger/Logger.js";
import { MemoryManager } from "./Manager.js";
import { compressMemory, extractMemoryFromContextMessages } from "./Extractor.js";

const memoryManagers: Map<string, MemoryManager> = new Map();

function getMemoryManager(
  runtime: ServiceRuntime,
  contextId: string,
): MemoryManager {
  const key = String(contextId || "").trim();
  if (!key) {
    throw new Error("Memory service requires a non-empty contextId");
  }
  const cacheKey = `${runtime.rootPath}::${key}`;
  const existing = memoryManagers.get(cacheKey);
  if (existing) return existing;
  const created = new MemoryManager(runtime, key);
  memoryManagers.set(cacheKey, created);
  return created;
}

/**
 * runContextMemoryMaintenance：按配置执行 context 记忆维护。
 *
 * 关键点（中文）
 * - 这是 service 侧能力，不属于 core context 内核
 * - core 只在“消息追加后”触发，不关心具体提取/压缩细节
 */
export async function runContextMemoryMaintenance(params: {
  context: ServiceRuntime;
  contextId: string;
}): Promise<void> {
  const contextId = String(params.contextId || "").trim();
  if (!contextId) return;

  const runtime = params.context;
  const config = runtime.config?.context?.memory;
  const enabled = config?.autoExtractEnabled ?? true;
  if (!enabled) return;

  const extractMinEntries = config?.extractMinEntries ?? 40;

  try {
    const serviceContext = runtime.context;
    const persistor = serviceContext.getContextPersistor(contextId);
    const totalEntries = await persistor.getTotalMessageCount();

    const memoryManager = getMemoryManager(runtime, contextId);
    const meta = await memoryManager.loadMeta();
    const lastMemorizedEntryCount = meta.lastMemorizedEntryCount ?? 0;
    const unmemorizedCount = totalEntries - lastMemorizedEntryCount;

    if (unmemorizedCount < extractMinEntries) return;

    void extractAndSaveMemory({
      context: runtime,
      contextId,
      startIndex: lastMemorizedEntryCount,
      endIndex: totalEntries,
    });
  } catch {
    return;
  }
}

async function extractAndSaveMemory(params: {
  context: ServiceRuntime;
  contextId: string;
  startIndex: number;
  endIndex: number;
}): Promise<void> {
  const { context: runtime, contextId, startIndex, endIndex } = params;
  const logger = getLogger(runtime.rootPath, "info");

  try {
    await logger.log("info", "Memory extraction started (async)", {
      contextId,
      entryRange: [startIndex, endIndex],
    });

    const model = runtime.context.model;

    const memoryEntry = await extractMemoryFromContextMessages({
      context: runtime,
      contextId,
      entryRange: [startIndex, endIndex],
      model,
    });

    const memoryManager = getMemoryManager(runtime, contextId);
    await memoryManager.append(memoryEntry);

    const meta = await memoryManager.loadMeta();
    await memoryManager.saveMeta({
      lastMemorizedEntryCount: endIndex,
      totalExtractions: (meta.totalExtractions ?? 0) + 1,
      lastExtractedAt: Date.now(),
    });

    await checkAndCompressMemory(runtime, contextId, model);

    await logger.log("info", "Memory extraction completed (async)", {
      contextId,
      entryRange: [startIndex, endIndex],
    });
  } catch (error) {
    await logger.log("error", "Memory extraction failed (async)", {
      contextId,
      error: String(error),
    });
  }
}

async function checkAndCompressMemory(
  runtime: ServiceRuntime,
  contextId: string,
  model: LanguageModel,
): Promise<void> {
  const logger = getLogger(runtime.rootPath, "info");

  try {
    const config = runtime.config?.context?.memory;
    const compressEnabled = config?.compressOnOverflow ?? true;
    if (!compressEnabled) return;

    const maxChars = config?.maxPrimaryChars ?? 15000;
    const memoryManager = getMemoryManager(runtime, contextId);
    const currentSize = await memoryManager.getSize();

    if (currentSize <= maxChars) return;

    await logger.log("info", "Memory compression started (async)", {
      contextId,
      currentSize,
      maxChars,
    });

    const backupEnabled = config?.backupBeforeCompress ?? true;
    if (backupEnabled) {
      const backupPath = await memoryManager.backup();
      await logger.log("info", "Memory backed up before compression", {
        contextId,
        backupPath,
      });
    }

    const currentContent = await memoryManager.load();
    const targetChars = Math.floor(maxChars * 0.8);
    const compressed = await compressMemory({
      context: runtime,
      contextId,
      currentContent,
      targetChars,
      model,
    });

    await memoryManager.overwrite(compressed);

    await logger.log("info", "Memory compression completed (async)", {
      contextId,
      originalSize: currentSize,
      compressedSize: compressed.length,
      targetChars,
    });
  } catch (error) {
    await logger.log("error", "Memory compression failed (async)", {
      contextId,
      error: String(error),
    });
  }
}
