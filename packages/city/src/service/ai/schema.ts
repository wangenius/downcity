/**
 * AI Service 数据库 schema 模块。
 *
 * 这里定义 AIService 自己持久化使用的表。当前主要用于图片生成任务，
 * 让 Worker 可以把长耗时生成从前台 HTTP 请求中拆出来。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_IMAGE_JOBS_TABLE = "ai_image_jobs";

/**
 * 默认 SQLite 图片任务表。
 */
export const sqliteAIImageJobs = sqliteTable(DEFAULT_IMAGE_JOBS_TABLE, {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: sqliteText("job_id").primaryKey(),
  /** 任务状态：queued / running / succeeded / failed。 */
  status: sqliteText("status").notNull(),
  /** 原始图片生成输入，JSON 字符串。 */
  input_json: sqliteText("input_json").notNull(),
  /** 成功后的 UIMessage 结果，JSON 字符串。 */
  result_json: sqliteText("result_json"),
  /** 失败时给客户端展示的错误消息。 */
  error: sqliteText("error"),
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message: sqliteText("message"),
  /** 当前 user_token 绑定的 City ID。 */
  city_id: sqliteText("city_id"),
  /** 当前终端用户 ID。 */
  user_id: sqliteText("user_id"),
  /** 本次任务解析到的模型 ID。 */
  model_id: sqliteText("model_id"),
  /** 创建时间。 */
  created_at: sqliteText("created_at").notNull(),
  /** 更新时间。 */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres 图片任务表。
 */
export const pgAIImageJobs = pgTable(DEFAULT_IMAGE_JOBS_TABLE, {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: pgText("job_id").primaryKey(),
  /** 任务状态：queued / running / succeeded / failed。 */
  status: pgText("status").notNull(),
  /** 原始图片生成输入，JSON 字符串。 */
  input_json: pgText("input_json").notNull(),
  /** 成功后的 UIMessage 结果，JSON 字符串。 */
  result_json: pgText("result_json"),
  /** 失败时给客户端展示的错误消息。 */
  error: pgText("error"),
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message: pgText("message"),
  /** 当前 user_token 绑定的 City ID。 */
  city_id: pgText("city_id"),
  /** 当前终端用户 ID。 */
  user_id: pgText("user_id"),
  /** 本次任务解析到的模型 ID。 */
  model_id: pgText("model_id"),
  /** 创建时间。 */
  created_at: pgText("created_at").notNull(),
  /** 更新时间。 */
  updated_at: pgText("updated_at").notNull(),
});
