/**
 * Memory Service 类型定义。
 *
 * 关键点（中文）
 * - 只保留 Memory V2 所需协议。
 * - 字段注释完整，供 CLI/API/运行时统一复用。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * 记忆来源类型。
 */
export type MemorySourceType = "longterm" | "daily" | "working";

/**
 * 查询模式。
 *
 * 说明（中文）
 * - 当前实现以 FTS 为主，保留字段用于后续向量扩展。
 */
export type MemorySearchMode = "fts";

/**
 * 单条记忆检索结果。
 */
export interface MemorySearchResultItem {
  /**
   * 片段来源路径（相对项目根目录）。
   */
  path: string;
  /**
   * 片段起始行号（1-based）。
   */
  startLine: number;
  /**
   * 片段结束行号（1-based）。
   */
  endLine: number;
  /**
   * 归一化分数（0~1，越高越相关）。
   */
  score: number;
  /**
   * 返回给模型/用户的片段文本（已按预算裁剪）。
   */
  snippet: string;
  /**
   * 记忆来源分类（长期/每日/工作记忆）。
   */
  source: MemorySourceType;
  /**
   * 引用标记（例如：`.ship/memory/MEMORY.md#L12-L20`）。
   */
  citation: string;
}

/**
 * 记忆检索请求。
 */
export interface MemorySearchPayload {
  /**
   * 查询语句。
   */
  query: string;
  /**
   * 可选返回条数上限，未传使用内置默认值。
   */
  maxResults?: number;
  /**
   * 可选分数阈值，未传使用内置默认值。
   */
  minScore?: number;
}

/**
 * 记忆检索响应。
 */
export interface MemorySearchResponse {
  /**
   * 返回结果集合。
   */
  results: MemorySearchResultItem[];
  /**
   * 当前检索模式。
   */
  mode: MemorySearchMode;
  /**
   * 当前后端标识。
   */
  backend: "builtin";
  /**
   * 若不可用则标记为 true。
   */
  disabled?: boolean;
  /**
   * 错误原因文本（失败场景）。
   */
  error?: string;
  /**
   * 建议动作（失败场景）。
   */
  action?: string;
}

/**
 * 读取记忆片段请求。
 */
export interface MemoryGetPayload {
  /**
   * 相对项目根目录的目标路径。
   */
  path: string;
  /**
   * 可选起始行（1-based）。
   */
  from?: number;
  /**
   * 可选读取行数。
   */
  lines?: number;
}

/**
 * 读取记忆片段响应。
 */
export interface MemoryGetResponse {
  /**
   * 目标路径（回显）。
   */
  path: string;
  /**
   * 读取内容；文件缺失时为空字符串。
   */
  text: string;
  /**
   * 文件不存在时为 true。
   */
  missing?: boolean;
}

/**
 * 显式写入请求。
 */
export interface MemoryStorePayload {
  /**
   * 要写入的文本内容。
   */
  content: string;
  /**
   * 目标记忆层，默认 `daily`。
   */
  target?: MemorySourceType;
  /**
   * 目标会话 ID（`working` 目标必填）。
   */
  contextId?: string;
}

/**
 * 显式写入响应。
 */
export interface MemoryStoreResponse {
  /**
   * 实际写入路径（相对项目根目录）。
   */
  path: string;
  /**
   * 实际写入目标层。
   */
  target: MemorySourceType;
  /**
   * 写入字节长度（UTF-16 字符计数）。
   */
  writtenChars: number;
}

/**
 * 手动索引请求。
 */
export interface MemoryIndexPayload {
  /**
   * 是否强制全量重建。
   */
  force?: boolean;
}

/**
 * 手动索引响应。
 */
export interface MemoryIndexResponse {
  /**
   * 本轮扫描文件总数。
   */
  totalFiles: number;
  /**
   * 本轮新增/变更并完成重建的文件数。
   */
  reindexedFiles: number;
  /**
   * 本轮删除的失效文件数。
   */
  removedFiles: number;
  /**
   * 本轮写入 chunk 总数。
   */
  totalChunks: number;
}

/**
 * Flush 请求。
 */
export interface MemoryFlushPayload {
  /**
   * 目标会话 ID。
   */
  contextId: string;
  /**
   * 可选最大提取消息条数。
   */
  maxMessages?: number;
}

/**
 * Flush 响应。
 */
export interface MemoryFlushResponse {
  /**
   * 写入路径（相对项目根目录）。
   */
  path: string;
  /**
   * 参与 flush 的消息条数。
   */
  messageCount: number;
  /**
   * 写入内容字符数。
   */
  writtenChars: number;
}

/**
 * 按来源统计。
 */
export interface MemorySourceStat {
  /**
   * 来源分类。
   */
  source: MemorySourceType;
  /**
   * 文件数量。
   */
  files: number;
  /**
   * 片段数量。
   */
  chunks: number;
}

/**
 * status 返回结构。
 */
export interface MemoryStatusResponse {
  /**
   * Memory 功能是否启用。
   */
  enabled: boolean;
  /**
   * 后端标识。
   */
  backend: "builtin";
  /**
   * 当前检索模式。
   */
  mode: MemorySearchMode;
  /**
   * 索引文件路径（相对项目根目录）。
   */
  dbPath: string;
  /**
   * 当前是否为 dirty 状态。
   */
  dirty: boolean;
  /**
   * 文件总数。
   */
  files: number;
  /**
   * chunk 总数。
   */
  chunks: number;
  /**
   * 按来源统计。
   */
  sourceCounts: MemorySourceStat[];
  /**
   * 最近一次同步时间戳（ms）。
   */
  lastSyncAt?: number;
  /**
   * 最近一次同步错误。
   */
  lastError?: string;
}

/**
 * Memory service 内置默认配置（不暴露复杂用户配置）。
 */
export interface MemoryDefaults {
  /**
   * 检索默认返回条数。
   */
  maxResults: number;
  /**
   * 检索默认最小分数。
   */
  minScore: number;
  /**
   * 注入预算（字符）。
   */
  maxInjectedChars: number;
  /**
   * 文件变更 debounce 时间（毫秒）。
   */
  watchDebounceMs: number;
  /**
   * 后台同步周期（分钟）。
   */
  intervalMinutes: number;
}

/**
 * Memory action payload 联合。
 */
export type MemoryActionPayload =
  | MemorySearchPayload
  | MemoryGetPayload
  | MemoryStorePayload
  | MemoryIndexPayload
  | MemoryFlushPayload
  | Record<string, JsonValue>;

