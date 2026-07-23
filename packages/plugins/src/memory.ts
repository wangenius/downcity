/**
 * `@downcity/plugins/memory` 独立公开入口。
 *
 * 关键点（中文）：只汇总 MemoryPlugin 及其存取、检索与 Wiki 能力协议类型。
 */

export { MemoryPlugin } from "./memory/MemoryPlugin.js";
export type {
  MemoryActionPayload,
  MemoryDefaults,
  MemoryDigestHandler,
  MemoryDigestHandlerInput,
  MemoryDigestHandlerOutput,
  MemoryDigestPayload,
  MemoryDigestResponse,
  MemoryPluginOptions,
  MemoryReadPayload,
  MemoryReadResponse,
  MemoryRememberPayload,
  MemoryRememberResponse,
  MemoryReviseHandler,
  MemoryReviseHandlerInput,
  MemoryReviseHandlerOutput,
  MemoryRevisePayload,
  MemoryReviseResponse,
  MemorySearchMode,
  MemorySearchPayload,
  MemorySearchResponse,
  MemorySearchResultItem,
  MemorySourceStat,
  MemorySourceType,
  MemoryStatusResponse,
  MemoryWikiPageDraft,
} from "./memory/types/Memory.js";
