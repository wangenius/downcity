/**
 * Agent Marketplace 数据访问模块。
 * 说明：
 * 1. 统一封装提交、查询、审核相关数据库读写逻辑。
 * 2. 这里直接复用 homepage 现有 Drizzle + PostgreSQL（Supabase）连接。
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/services/database/client";
import { agentMarketplaceSubmissions } from "@/services/database/schema";
import type {
  AgentMarketplaceSubmissionRecord,
  CreateAgentMarketplaceSubmissionInput,
  ReviewAgentMarketplaceSubmissionInput,
} from "@/types/agent-marketplace";

/**
 * 将数据库记录映射为页面与服务层共享结构。
 */
function mapSubmissionRecord(
  record: typeof agentMarketplaceSubmissions.$inferSelect,
): AgentMarketplaceSubmissionRecord {
  return {
    id: record.id,
    agentName: record.agentName,
    repositoryUrl: record.repositoryUrl,
    normalizedRepositoryUrl: record.normalizedRepositoryUrl,
    description: record.description,
    category: record.category,
    submitterName: record.submitterName,
    submitterEmail: record.submitterEmail,
    homepageUrl: record.homepageUrl,
    demoUrl: record.demoUrl,
    reviewStatus: record.reviewStatus,
    reviewNotes: record.reviewNotes,
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt,
    approvedAt: record.approvedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * 读取已通过审核、可公开展示的 Agent 列表。
 */
export async function listApprovedAgentMarketplaceSubmissions() {
  const records = await db
    .select()
    .from(agentMarketplaceSubmissions)
    .where(eq(agentMarketplaceSubmissions.reviewStatus, "approved"))
    .orderBy(
      desc(agentMarketplaceSubmissions.approvedAt),
      desc(agentMarketplaceSubmissions.createdAt),
    );

  return records.map(mapSubmissionRecord);
}

/**
 * 读取后台审核页需要的完整提交列表。
 */
export async function listAgentMarketplaceSubmissionsForReview() {
  const records = await db
    .select()
    .from(agentMarketplaceSubmissions)
    .orderBy(
      desc(agentMarketplaceSubmissions.createdAt),
      desc(agentMarketplaceSubmissions.updatedAt),
    );

  return records.map(mapSubmissionRecord);
}

/**
 * 创建新的 Agent 提交记录。
 */
export async function createAgentMarketplaceSubmission(
  input: CreateAgentMarketplaceSubmissionInput,
) {
  const now = new Date();
  const [record] = await db
    .insert(agentMarketplaceSubmissions)
    .values({
      id: crypto.randomUUID(),
      agentName: input.agentName,
      repositoryUrl: input.repositoryUrl,
      normalizedRepositoryUrl: input.normalizedRepositoryUrl,
      description: input.description,
      category: input.category,
      submitterName: input.submitterName,
      submitterEmail: input.submitterEmail,
      homepageUrl: input.homepageUrl ?? null,
      demoUrl: input.demoUrl ?? null,
      reviewStatus: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapSubmissionRecord(record);
}

/**
 * 更新 Agent 审核结果。
 */
export async function reviewAgentMarketplaceSubmission(
  input: ReviewAgentMarketplaceSubmissionInput,
) {
  const now = new Date();
  const approvedAt = input.reviewStatus === "approved" ? now : null;

  const [record] = await db
    .update(agentMarketplaceSubmissions)
    .set({
      reviewStatus: input.reviewStatus,
      reviewNotes: input.reviewNotes ?? null,
      reviewedBy: input.reviewedBy,
      reviewedAt: now,
      approvedAt,
      updatedAt: now,
    })
    .where(eq(agentMarketplaceSubmissions.id, input.submissionId))
    .returning();

  return record ? mapSubmissionRecord(record) : null;
}

/**
 * 判断某个仓库链接是否已经提交过。
 */
export async function findAgentMarketplaceSubmissionByNormalizedRepositoryUrl(
  normalizedRepositoryUrl: string,
) {
  const [record] = await db
    .select()
    .from(agentMarketplaceSubmissions)
    .where(
      and(
        eq(
          agentMarketplaceSubmissions.normalizedRepositoryUrl,
          normalizedRepositoryUrl,
        ),
      ),
    )
    .limit(1);

  return record ? mapSubmissionRecord(record) : null;
}
