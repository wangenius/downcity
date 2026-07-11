/**
 * SessionHistoryMeta：随 sessionId 持久化的元信息。
 *
 * 关键点（中文）
 * - 存储位置：`.downcity/agents/<encodedAgentId>/sessions/<encodedSessionId>/messages/meta.json`
 * - 用于保存 session 列表、详情和索引所需的轻量元信息
 */

export type SessionHistoryMetaV1 = {
  /** schema 版本。 */
  v: 1;
  /** 当前元信息所属的 sessionId。 */
  sessionId: string;
  /** 当前 session 所属的 agentId。 */
  agentId?: string;
  /** 当前 session 首次创建时间戳（ms）。 */
  createdAt?: number;
  /** 当前 session 初始化时解析到的系统时区。 */
  timezone?: string;
  /** 最近一次更新元信息的时间戳（ms）。 */
  updatedAt: number;
  /** 当前 session 持久化标题。 */
  title?: string;
  /** 当前 session 绑定模型的可读标签。 */
  modelLabel?: string;
  /** 当前 session 绑定模型的稳定 ID，用于进程重启后恢复模型实例。 */
  modelId?: string;
  /** 当前 session 已持久化记录数量，用于列表查询避免扫描完整历史。 */
  messageCount?: number;
  /** 当前 session 最后一条记录的用户可见摘要，用于列表预览。 */
  previewText?: string;
  /** 生成当前摘要时 messages.jsonl 的字节长度，用于校验摘要是否仍然有效。 */
  historyBytes?: number;
};
