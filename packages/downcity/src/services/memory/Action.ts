/**
 * Memory Service Action 逻辑。
 *
 * 关键点（中文）
 * - 只处理业务动作，不包含 CLI/API 参数映射细节。
 * - 所有动作统一返回结构化结果，失败不抛给上层。
 */

import type { ServiceActionResult } from "@/types/Service.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  MemoryFlushPayload,
  MemoryGetPayload,
  MemoryIndexPayload,
  MemorySearchPayload,
  MemoryStorePayload,
} from "@services/memory/types/Memory.js";
import { flushMemory } from "./runtime/Flush.js";
import { searchMemory } from "./runtime/Search.js";
import {
  MEMORY_DEFAULTS,
  ensureMemoryIndexed,
  type MemoryRuntimeState,
} from "./runtime/Store.js";
import { getMemory, storeMemory } from "./runtime/Writer.js";

/**
 * status action。
 */
export async function statusMemoryAction(
  context: ExecutionContext,
  state: MemoryRuntimeState,
): Promise<ServiceActionResult<JsonValue>> {
  try {
    const stats = state.indexer.status();
    return {
      success: true,
      data: {
        enabled: state.enabled,
        backend: "builtin",
        mode: "fts",
        dbPath: state.indexer.getRelativeDbPath(),
        dirty: state.dirty,
        files: stats.files,
        chunks: stats.chunks,
        sourceCounts: stats.sourceCounts,
        ...(typeof state.lastSyncAt === "number"
          ? { lastSyncAt: state.lastSyncAt }
          : {}),
        ...(state.lastError ? { lastError: state.lastError } : {}),
      } as unknown as JsonValue,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * index action。
 */
export async function indexMemoryAction(
  context: ExecutionContext,
  state: MemoryRuntimeState,
  payload: MemoryIndexPayload,
): Promise<ServiceActionResult<JsonValue>> {
  try {
    const result = await ensureMemoryIndexed(context, state, {
      force: payload.force === true,
      reason: payload.force ? "manual-force" : "manual",
    });
    const status = state.indexer.status();
    const data = {
      totalFiles: result?.totalFiles ?? status.files,
      reindexedFiles: result?.reindexedFiles ?? 0,
      removedFiles: result?.removedFiles ?? 0,
      totalChunks: result?.totalChunks ?? 0,
    };
    return { success: true, data: data as unknown as JsonValue };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * search action。
 */
export async function searchMemoryAction(
  context: ExecutionContext,
  state: MemoryRuntimeState,
  payload: MemorySearchPayload,
): Promise<ServiceActionResult<JsonValue>> {
  try {
    const response = await searchMemory(context, state, payload);
    return {
      success: true,
      data: response as unknown as JsonValue,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * get action。
 */
export async function getMemoryAction(
  context: ExecutionContext,
  payload: MemoryGetPayload,
): Promise<ServiceActionResult<JsonValue>> {
  try {
    const data = await getMemory(context, payload);
    return { success: true, data: data as unknown as JsonValue };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * store action。
 */
export async function storeMemoryAction(
  context: ExecutionContext,
  state: MemoryRuntimeState,
  payload: MemoryStorePayload,
): Promise<ServiceActionResult<JsonValue>> {
  try {
    const data = await storeMemory(context, state, payload);
    return { success: true, data: data as unknown as JsonValue };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * flush action。
 */
export async function flushMemoryAction(
  context: ExecutionContext,
  state: MemoryRuntimeState,
  payload: MemoryFlushPayload,
): Promise<ServiceActionResult> {
  try {
    const data = await flushMemory(context, state, payload);
    return { success: true, data: data as unknown as JsonValue };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * 把任意 payload 归一化为 search payload。
 */
export function toSearchPayload(input: Record<string, unknown>): MemorySearchPayload {
  return {
    query: String(input.query || ""),
    maxResults:
      typeof input.maxResults === "number"
        ? input.maxResults
        : typeof input.maxResults === "string"
          ? Number(input.maxResults)
          : MEMORY_DEFAULTS.maxResults,
    minScore:
      typeof input.minScore === "number"
        ? input.minScore
        : typeof input.minScore === "string"
          ? Number(input.minScore)
          : MEMORY_DEFAULTS.minScore,
  };
}
