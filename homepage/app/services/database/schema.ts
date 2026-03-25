import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Core tables required by Better Auth for PostgreSQL
// Reference: Better Auth Drizzle adapter schema requirements
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"), // used for email/password
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Agent 社区资源分类枚举。
 * 说明：
 * 1. 公开页与后台审核统一使用这一组分类值。
 * 2. 使用 PostgreSQL enum，方便 Supabase 侧直接筛选与校验。
 */
export const agentMarketplaceCategoryEnum = pgEnum(
  "agent_marketplace_category",
  ["development", "documentation", "maintenance", "testing"],
);

/**
 * Agent 社区资源审核状态枚举。
 * 说明：
 * 1. `pending` 表示等待审核。
 * 2. `approved` 才会在公开资源页展示。
 * 3. `rejected` 会保留在数据库中供管理员追踪。
 */
export const agentMarketplaceReviewStatusEnum = pgEnum(
  "agent_marketplace_review_status",
  ["pending", "approved", "rejected"],
);

/**
 * Agent 社区资源提交表。
 * 说明：
 * 1. 所有社区提交先进入该表，默认状态为 `pending`。
 * 2. 管理员审核通过后，公开页只读取 `approved` 数据。
 */
export const agentMarketplaceSubmissions = pgTable(
  "agent_marketplace_submissions",
  {
    id: text("id").primaryKey(),
    agentName: text("agent_name").notNull(),
    repositoryUrl: text("repository_url").notNull(),
    normalizedRepositoryUrl: text("normalized_repository_url").notNull(),
    description: text("description").notNull(),
    category: agentMarketplaceCategoryEnum("category").notNull(),
    submitterName: text("submitter_name").notNull(),
    submitterEmail: text("submitter_email").notNull(),
    homepageUrl: text("homepage_url"),
    demoUrl: text("demo_url"),
    reviewStatus: agentMarketplaceReviewStatusEnum("review_status")
      .notNull()
      .default("pending"),
    reviewNotes: text("review_notes"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    normalizedRepositoryUrlUnique: uniqueIndex(
      "agent_marketplace_submissions_normalized_repo_idx",
    ).on(table.normalizedRepositoryUrl),
  }),
);
