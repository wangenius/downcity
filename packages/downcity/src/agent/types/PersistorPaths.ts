/**
 * FilePersistor 路径覆盖类型。
 *
 * 关键点（中文）
 * - 用于把 persistor 落盘路径定向到自定义目录（例如 task run 目录）。
 * - 每个字段都为可选，未提供时回退到默认 `.downcity/session/<encodedSessionId>/messages/*`。
 */
export type PersistorPathOverrides = {
  /**
   * Session 根目录（通常是 `.downcity/session/<encodedSessionId>`）。
   */
  sessionDirPath?: string;

  /**
   * 消息目录（通常是 `.../messages`）。
   */
  messagesDirPath?: string;

  /**
   * 消息文件完整路径（通常是 `.../messages/messages.jsonl`）。
   */
  messagesFilePath?: string;

  /**
   * 元数据文件完整路径（通常是 `.../messages/meta.json`）。
   */
  metaFilePath?: string;

  /**
   * 历史归档目录（通常是 `.../messages/archive`）。
   */
  archiveDirPath?: string;
};
