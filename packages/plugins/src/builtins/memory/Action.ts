/**
 * Memory Service Action 逻辑。
 *
 * 关键点（中文）
 * - 只处理业务动作，不包含 CLI/API 参数映射细节。
 * - 所有动作统一返回结构化结果，失败不抛给上层。
 */

import type { PluginActionResult } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import type {
  MemoryFlushPayload,
  MemoryGetPayload,
  MemorySearchPayload,
  MemoryStorePayload,
} from "@/builtins/memory/types/Memory.js";
import { flushMemory } from "./runtime/Flush.js";
import {
  collectMemoryStatus,
  searchMemory,
} from "./runtime/Search.js";
import {
  MEMORY_DEFAULTS,
  type MemoryRuntimeState,
} from "./runtime/Store.js";
import { getMemory, storeMemory } from "./runtime/Writer.js";

/**
 * status action。
 */
export async function statusMemoryAction(
  context: AgentContext,
  state: MemoryRuntimeState,
): Promise<PluginActionResult<JsonValue>> {
  try {
    const stats = await collectMemoryStatus(context, state);
    return {
      success: true,
      data: stats as unknown as JsonValue,
    };
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
  context: AgentContext,
  state: MemoryRuntimeState,
  payload: MemorySearchPayload,
): Promise<PluginActionResult<JsonValue>> {
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
  context: AgentContext,
  payload: MemoryGetPayload,
): Promise<PluginActionResult<JsonValue>> {
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
  context: AgentContext,
  state: MemoryRuntimeState,
  payload: MemoryStorePayload,
): Promise<PluginActionResult<JsonValue>> {
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
  context: AgentContext,
  state: MemoryRuntimeState,
  payload: MemoryFlushPayload,
): Promise<PluginActionResult> {
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
