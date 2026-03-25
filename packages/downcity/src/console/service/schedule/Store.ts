/**
 * Service Schedule 持久化存储。
 *
 * 关键点（中文）
 * - 使用项目内 SQLite 持久化 one-shot service action 调度任务。
 * - 当前模块只维护“当前状态”，不维护额外审计事件流。
 */

import fs from "fs-extra";
import Database from "better-sqlite3";
import path from "node:path";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { scheduledJobsTable } from "./Schema.js";
import type {
  CreateScheduledJobInput,
  ScheduledJobRecord,
  ScheduledJobStatus,
} from "@/types/ServiceSchedule.js";
import type { JsonValue } from "@/types/Json.js";
import { generateId } from "@/utils/Id.js";
import { getShipScheduleDbPath } from "@/console/env/Paths.js";

type ScheduledJobRow = typeof scheduledJobsTable.$inferSelect;

/**
 * Service Schedule Store。
 */
export class ServiceScheduleStore {
  private readonly sqlite: Database.Database;

  private readonly db: ReturnType<typeof drizzle>;

  constructor(projectRoot: string) {
    const dbPath = getShipScheduleDbPath(projectRoot);
    fs.ensureDirSync(path.dirname(dbPath));
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.db = drizzle(this.sqlite);
    this.ensureSchema();
  }

  /**
   * 初始化表结构。
   */
  private ensureSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        service_name TEXT NOT NULL,
        action_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        run_at_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS scheduled_jobs_status_run_at_idx
      ON scheduled_jobs(status, run_at_ms);
    `);
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS scheduled_jobs_run_at_idx
      ON scheduled_jobs(run_at_ms);
    `);
  }

  /**
   * 关闭数据库连接。
   */
  close(): void {
    this.sqlite.close();
  }

  /**
   * 创建调度任务。
   */
  createJob(input: CreateScheduledJobInput): ScheduledJobRecord {
    const now = Date.now();
    const id = `sched_${generateId()}`;
    const payloadJson = JSON.stringify(input.payload ?? null);
    this.db.insert(scheduledJobsTable).values({
      id,
      serviceName: String(input.serviceName || "").trim(),
      actionName: String(input.actionName || "").trim(),
      payloadJson,
      runAtMs: Math.trunc(input.runAtMs),
      status: "pending",
      error: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    return {
      id,
      serviceName: String(input.serviceName || "").trim(),
      actionName: String(input.actionName || "").trim(),
      payload: input.payload ?? null,
      runAtMs: Math.trunc(input.runAtMs),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 获取单个任务。
   */
  getJobById(jobId: string): ScheduledJobRecord | null {
    const row = this.db.select().from(scheduledJobsTable)
      .where(eq(scheduledJobsTable.id, String(jobId || "").trim()))
      .get();
    return row ? this.toJobRecord(row) : null;
  }

  /**
   * 列出指定状态的任务。
   */
  listJobsByStatus(statuses: ScheduledJobStatus[]): ScheduledJobRecord[] {
    if (statuses.length === 0) return [];
    const rows = this.db.select().from(scheduledJobsTable)
      .where(inArray(scheduledJobsTable.status, statuses))
      .orderBy(asc(scheduledJobsTable.runAtMs))
      .all();
    return rows.map((row) => this.toJobRecord(row));
  }

  /**
   * 列出已到点且待执行的任务。
   */
  listDuePendingJobs(nowMs: number): ScheduledJobRecord[] {
    const rows = this.db.select().from(scheduledJobsTable)
      .where(
        and(
          eq(scheduledJobsTable.status, "pending"),
          lte(scheduledJobsTable.runAtMs, Math.trunc(nowMs)),
        ),
      )
      .orderBy(asc(scheduledJobsTable.runAtMs))
      .all();
    return rows.map((row) => this.toJobRecord(row));
  }

  /**
   * 启动恢复时，把历史 `running` 回退到 `pending`。
   */
  resetRunningJobsToPending(): number {
    const now = Date.now();
    const result = this.db.update(scheduledJobsTable)
      .set({
        status: "pending",
        updatedAt: now,
        error: null,
      })
      .where(eq(scheduledJobsTable.status, "running"))
      .run();
    return Number(result.changes || 0);
  }

  /**
   * 将任务标记为执行中。
   *
   * 关键点（中文）
   * - 仅允许从 `pending` 进入 `running`，避免重复领取。
   */
  markJobRunning(jobId: string): boolean {
    const result = this.db.update(scheduledJobsTable)
      .set({
        status: "running",
        updatedAt: Date.now(),
        error: null,
      })
      .where(
        and(
          eq(scheduledJobsTable.id, String(jobId || "").trim()),
          eq(scheduledJobsTable.status, "pending"),
        ),
      )
      .run();
    return Number(result.changes || 0) > 0;
  }

  /**
   * 将任务标记为成功。
   */
  markJobSucceeded(jobId: string): boolean {
    return this.updateTerminalStatus({
      jobId,
      status: "succeeded",
    });
  }

  /**
   * 将任务标记为失败。
   */
  markJobFailed(jobId: string, error: string): boolean {
    return this.updateTerminalStatus({
      jobId,
      status: "failed",
      error,
    });
  }

  /**
   * 将任务标记为取消。
   */
  markJobCancelled(jobId: string): boolean {
    return this.updateTerminalStatus({
      jobId,
      status: "cancelled",
    });
  }

  /**
   * 统一写入终态。
   */
  private updateTerminalStatus(params: {
    jobId: string;
    status: Exclude<ScheduledJobStatus, "pending" | "running">;
    error?: string;
  }): boolean {
    const result = this.db.update(scheduledJobsTable)
      .set({
        status: params.status,
        updatedAt: Date.now(),
        error: params.error ? String(params.error) : null,
      })
      .where(eq(scheduledJobsTable.id, String(params.jobId || "").trim()))
      .run();
    return Number(result.changes || 0) > 0;
  }

  /**
   * 行转业务对象。
   */
  private toJobRecord(row: ScheduledJobRow): ScheduledJobRecord {
    return {
      id: row.id,
      serviceName: row.serviceName,
      actionName: row.actionName,
      payload: this.parsePayloadJson(row.payloadJson),
      runAtMs: row.runAtMs,
      status: row.status as ScheduledJobStatus,
      ...(typeof row.error === "string" && row.error ? { error: row.error } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * 安全解析 payload JSON。
   */
  private parsePayloadJson(input: string): JsonValue {
    try {
      return JSON.parse(String(input || "null")) as JsonValue;
    } catch {
      return null;
    }
  }
}
