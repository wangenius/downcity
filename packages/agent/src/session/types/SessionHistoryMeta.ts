/**
 * SessionHistoryMeta：随 sessionId 持久化的元信息。
 *
 * 关键点（中文）
 * - 存储位置：`.downcity/session/<encodedSessionId>/messages/meta.json`
 * - 用于保存 compact 元数据与固定注入的 skills 信息
 */

/**
 * SDK Session 配置摘要。
 *
 * 关键点（中文）
 * - 这里只存可稳定序列化、仅用于回显/索引的轻量配置摘要。
 * - 例如本地注入的 `LanguageModel` 实例本身不可序列化，因此仅记录其可读标签。
 */
export type SessionHistorySdkConfigV1 = {
  /** 当前 session 绑定模型的可读标签。 */
  modelLabel?: string;
};

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
  /** 固定注入到 Session 上下文的 skill id 列表。 */
  pinnedSkillIds: string[];
  /** 最近一次归档生成的 archive id。 */
  lastArchiveId?: string;
  /** 最近一次 compact 生效的保留消息数。 */
  keepLastMessages?: number;
  /** 最近一次 compact 生效的输入 token 近似上限。 */
  maxInputTokensApprox?: number;
  /** 最近一次 compact 生效的前段压缩比例。 */
  compactRatio?: number;
  /** SDK 侧的轻量配置摘要。 */
  sdkConfig?: SessionHistorySdkConfigV1;
};
