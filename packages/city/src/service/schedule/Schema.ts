/**
 * Service Schedule SQLite schema。
 *
 * 关键点（中文）
 * - 使用 Drizzle 定义本地调度任务表。
 * - 仅保留 MVP 所需字段：任务目标、执行时间、状态与错误摘要。
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 调度任务表。
 */
export const scheduledJobsTable = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    serviceName: text("service_name").notNull(),
    actionName: text("action_name").notNull(),
    payloadJson: text("payload_json").notNull(),
    runAtMs: integer("run_at_ms").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    statusRunAtIdx: index("scheduled_jobs_status_run_at_idx").on(
      table.status,
      table.runAtMs,
    ),
    runAtIdx: index("scheduled_jobs_run_at_idx").on(table.runAtMs),
  }),
);
