/**
 * ContextStore 路径覆盖类型。
 *
 * 关键点（中文）
 * - `core` 不直接依赖 `main/services` 的路径解析实现。
 * - 由外层注入 path override，实现 task run 等特殊落盘布局。
 */

export type ContextStorePathOverrides = {
  contextDirPath?: string;
  messagesDirPath?: string;
  messagesFilePath?: string;
  metaFilePath?: string;
  archiveDirPath?: string;
};

/**
 * 按 contextId 解析 ContextStore 路径覆盖。
 */
export type ResolveContextStorePathOverrides = (
  contextId: string,
) => ContextStorePathOverrides | null | undefined;
