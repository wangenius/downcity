/**
 * Agent Marketplace 类型定义。
 * 说明：
 * 1. 这里统一放置 marketplace 提交、展示、审核相关的共享类型。
 * 2. 所有字段都带注释，便于页面、服务层与数据库访问保持一致语义。
 */

/**
 * Agent 社区资源的分类枚举。
 */
export const AGENT_MARKETPLACE_CATEGORIES = [
  "development",
  "documentation",
  "maintenance",
  "testing",
] as const;

/**
 * Agent 提交审核状态枚举。
 */
export const AGENT_MARKETPLACE_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

/**
 * Agent 社区资源分类。
 */
export type AgentMarketplaceCategory =
  (typeof AGENT_MARKETPLACE_CATEGORIES)[number];

/**
 * Agent 社区资源审核状态。
 */
export type AgentMarketplaceReviewStatus =
  (typeof AGENT_MARKETPLACE_REVIEW_STATUSES)[number];

/**
 * Agent 社区资源记录。
 */
export interface AgentMarketplaceSubmissionRecord {
  /** 提交记录唯一标识，用于审核和展示时精确定位。 */
  id: string;
  /** Agent 对外展示名称，会直接出现在社区资源列表卡片中。 */
  agentName: string;
  /** 用户提交的代码仓库链接原始值，用于对外跳转仓库。 */
  repositoryUrl: string;
  /** 归一化后的代码仓库链接，用于去重与唯一性约束。 */
  normalizedRepositoryUrl: string;
  /** Agent 的简要介绍，用于帮助用户快速理解用途。 */
  description: string;
  /** Agent 所属分类，用于筛选与分组展示。 */
  category: AgentMarketplaceCategory;
  /** 提交者名称，用于在审核后台识别维护者身份。 */
  submitterName: string;
  /** 提交者邮箱，用于后续联系与审核追踪。 */
  submitterEmail: string;
  /** 可选主页链接，用于补充官方站点或介绍页。 */
  homepageUrl: string | null;
  /** 可选演示链接，用于展示视频、Demo 或在线体验页。 */
  demoUrl: string | null;
  /** 当前审核状态，决定是否能在公开页面显示。 */
  reviewStatus: AgentMarketplaceReviewStatus;
  /** 审核备注，记录管理员的通过/拒绝原因。 */
  reviewNotes: string | null;
  /** 审核人标识，可记录操作者名称或邮箱。 */
  reviewedBy: string | null;
  /** 最近一次审核时间，用于排序与追踪状态变化。 */
  reviewedAt: Date | null;
  /** 首次通过审核的时间，用于公开页显示上线时间。 */
  approvedAt: Date | null;
  /** 记录创建时间，用于后台查看提交先后顺序。 */
  createdAt: Date;
  /** 记录更新时间，用于后台识别最近一次变更。 */
  updatedAt: Date;
}

/**
 * 新提交 Agent 的输入参数。
 */
export interface CreateAgentMarketplaceSubmissionInput {
  /** Agent 展示名称。 */
  agentName: string;
  /** 仓库链接原始值。 */
  repositoryUrl: string;
  /** 归一化后的仓库链接。 */
  normalizedRepositoryUrl: string;
  /** Agent 描述。 */
  description: string;
  /** Agent 分类。 */
  category: AgentMarketplaceCategory;
  /** 提交者名称。 */
  submitterName: string;
  /** 提交者邮箱。 */
  submitterEmail: string;
  /** 可选主页链接。 */
  homepageUrl?: string | null;
  /** 可选演示链接。 */
  demoUrl?: string | null;
}

/**
 * 审核 Agent 的输入参数。
 */
export interface ReviewAgentMarketplaceSubmissionInput {
  /** 被审核的提交记录 ID。 */
  submissionId: string;
  /** 审核后要写入的新状态。 */
  reviewStatus: Extract<AgentMarketplaceReviewStatus, "approved" | "rejected">;
  /** 审核人标识。 */
  reviewedBy: string;
  /** 可选审核备注。 */
  reviewNotes?: string | null;
}

/**
 * 公共提交表单值。
 */
export interface AgentMarketplaceSubmissionFormValues {
  /** 仓库链接输入框值。 */
  repositoryUrl: string;
  /** 提交者邮箱输入框值。 */
  submitterEmail: string;
}

/**
 * 公共提交表单错误集合。
 */
export interface AgentMarketplaceSubmissionFormErrors {
  /** 仓库链接字段错误。 */
  repositoryUrl?: string;
  /** 提交者邮箱字段错误。 */
  submitterEmail?: string;
  /** 表单级通用错误。 */
  form?: string;
}

/**
 * 公共提交 action 返回值。
 */
export interface AgentMarketplaceSubmissionActionData {
  /** 当前提交是否成功写入。 */
  ok: boolean;
  /** 表单错误集合。 */
  errors?: AgentMarketplaceSubmissionFormErrors;
  /** 失败时回填到表单的原始值。 */
  values?: AgentMarketplaceSubmissionFormValues;
}
