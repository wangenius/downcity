/**
 * Memory Search 运行时。
 *
 * 关键点（中文）
 * - 收敛检索默认参数与容错返回。
 * - 检索前确保索引同步（dirty 时自动补齐）。
 */

import type { ServiceRuntime } from "@agent/service/ServiceRuntime.js";
import type {
  MemorySearchPayload,
  MemorySearchResponse,
} from "@services/memory/types/Memory.js";
import {
  MEMORY_DEFAULTS,
  ensureMemoryIndexed,
  getOrCreateMemoryState,
} from "./Store.js";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * 执行检索。
 */
export async function searchMemory(
  runtime: ServiceRuntime,
  payload: MemorySearchPayload,
): Promise<MemorySearchResponse> {
  const state = getOrCreateMemoryState(runtime);
  if (!state.enabled) {
    return {
      backend: "builtin",
      mode: "fts",
      results: [],
      disabled: true,
      error: "memory service disabled",
      action: "Set context.memory.enabled=true or remove the config override.",
    };
  }

  const query = String(payload.query || "").trim();
  if (!query) {
    return {
      backend: "builtin",
      mode: "fts",
      results: [],
    };
  }

  const maxResults = Math.floor(
    clampNumber(
      Number(payload.maxResults ?? MEMORY_DEFAULTS.maxResults),
      1,
      20,
    ),
  );
  const minScore = clampNumber(
    Number(payload.minScore ?? MEMORY_DEFAULTS.minScore),
    0,
    1,
  );

  try {
    await ensureMemoryIndexed(runtime, { reason: "search" });
    const results = state.indexer.search({
      query,
      maxResults,
      minScore,
      maxInjectedChars: MEMORY_DEFAULTS.maxInjectedChars,
    });
    return {
      backend: "builtin",
      mode: "fts",
      results,
    };
  } catch (error) {
    const message = String(error);
    return {
      backend: "builtin",
      mode: "fts",
      results: [],
      disabled: true,
      error: message,
      action: "Run `city memory index --force` to rebuild local memory index.",
    };
  }
}

