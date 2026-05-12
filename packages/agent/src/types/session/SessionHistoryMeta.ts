/**
 * SessionHistoryMeta：随 sessionId 持久化的元信息。
 *
 * 关键点（中文）
 * - 存储位置：`.downcity/session/<encodedSessionId>/messages/meta.json`
 * - 用于保存 compact 元数据与固定注入的 skills 信息
 */

export type SessionHistoryMetaV1 = {
  /** schema 版本。 */
  v: 1;
  /** 当前元信息所属的 sessionId。 */
  sessionId: string;
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
};
