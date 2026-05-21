/**
 * Service Schedule 持久化存储。
 *
 * 关键点（中文）
 * - 调度任务改为使用项目内 `jsonl` 事件流持久化，不再依赖 SQLite。
 * - 这里采用“全量重放 + 内存归并”的最简实现，保持职责清晰且易于迁移。
 * - 文件只记录状态事件；对外仍暴露稳定的调度任务查询与状态更新接口。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  CreateScheduledJobInput,
  ScheduledJobRecord,
  ScheduledJobStatus,
} from "@/service/types/ServiceSchedule.js";
import { generateId } from "@/utils/Id.js";
import { getDowncityScheduleDbPath } from "@/config/Paths.js";

type ScheduledJobEvent =
  | {
      /**
       * 事件版本号。
       */
      v: 1;
      /**
       * 事件类型：创建任务。
       */
      type: "created";
      /**
       * 调度任务快照。
       */
      job: ScheduledJobRecord;
    }
  | {
      /**
       * 事件版本号。
       */
      v: 1;
      /**
       * 事件类型：状态更新。
       */
      type: "status";
      /**
       * 目标任务 ID。
       */
      jobId: string;
      /**
       * 新状态。
       */
      status: ScheduledJobStatus;
      /**
       * 最新更新时间。
       */
      updatedAt: number;
      /**
       * 可选错误信息。
       */
      error?: string;
    };

function readJsonlLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeJobRecord(input: ScheduledJobRecord): ScheduledJobRecord {
  return {
    id: String(input.id || "").trim(),
    serviceName: String(input.serviceName || "").trim(),
    actionName: String(input.actionName || "").trim(),
    payload: input.payload ?? null,
    runAtMs: Math.trunc(input.runAtMs),
    status: input.status,
    ...(typeof input.error === "string" && input.error ? { error: input.error } : {}),
    createdAt: Math.trunc(input.createdAt),
    updatedAt: Math.trunc(input.updatedAt),
  };
}

function parseEvent(line: string): ScheduledJobEvent | null {
  try {
    const raw = JSON.parse(line) as Partial<ScheduledJobEvent> | null;
    if (!raw || typeof raw !== "object") return null;
    if (raw.type === "created" && raw.job) {
      return {
        v: 1,
        type: "created",
        job: normalizeJobRecord(raw.job as ScheduledJobRecord),
      };
    }
    if (
      raw.type === "status" &&
      typeof raw.jobId === "string" &&
      typeof raw.status === "string" &&
      typeof raw.updatedAt === "number"
    ) {
      return {
        v: 1,
        type: "status",
        jobId: raw.jobId,
        status: raw.status as ScheduledJobStatus,
        updatedAt: Math.trunc(raw.updatedAt),
        ...(typeof raw.error === "string" ? { error: raw.error } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function compareJobs(a: ScheduledJobRecord, b: ScheduledJobRecord): number {
  if (a.runAtMs !== b.runAtMs) return a.runAtMs - b.runAtMs;
  return b.createdAt - a.createdAt;
}

/**
 * Service Schedule Store。
 */
export class ServiceScheduleStore {
  private readonly filePath: string;

  constructor(projectRoot: string) {
    this.filePath = getDowncityScheduleDbPath(projectRoot);
    fs.ensureDirSync(path.dirname(this.filePath));
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "", "utf-8");
    }
  }

  /**
   * 关闭存储。
   *
   * 说明（中文）
   * - jsonl 版本无需保持长连接，因此 close 为 no-op。
   */
  close(): void {}

  /**
   * 创建调度任务。
   */
  createJob(input: CreateScheduledJobInput): ScheduledJobRecord {
    const now = Date.now();
    const job: ScheduledJobRecord = {
      id: `sched_${generateId()}`,
      serviceName: String(input.serviceName || "").trim(),
      actionName: String(input.actionName || "").trim(),
      payload: input.payload ?? null,
      runAtMs: Math.trunc(input.runAtMs),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.appendEvent({
      v: 1,
      type: "created",
      job,
    });
    return job;
  }

  /**
   * 获取单个任务。
   */
  getJobById(jobId: string): ScheduledJobRecord | null {
    const key = String(jobId || "").trim();
    if (!key) return null;
    return this.readJobMap().get(key) || null;
  }

  /**
   * 列出指定状态的任务。
   */
  listJobsByStatus(statuses: ScheduledJobStatus[]): ScheduledJobRecord[] {
    if (statuses.length === 0) return [];
    const allowed = new Set(statuses);
    return this.readJobs()
      .filter((job) => allowed.has(job.status))
      .sort(compareJobs);
  }

  /**
   * 列出任务。
   */
  listJobs(params?: {
    status?: ScheduledJobStatus;
    limit?: number;
  }): ScheduledJobRecord[] {
    const limit =
      typeof params?.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.trunc(params.limit))
        : 100;
    const jobs = this.readJobs()
      .filter((job) => !params?.status || job.status === params.status)
      .sort(compareJobs);
    return jobs.slice(0, limit);
  }

  /**
   * 列出已到点且待执行的任务。
   */
  listDuePendingJobs(nowMs: number): ScheduledJobRecord[] {
    return this.readJobs()
      .filter((job) => job.status === "pending" && job.runAtMs <= Math.trunc(nowMs))
      .sort(compareJobs);
  }

  /**
   * 启动恢复时，把历史 `running` 回退到 `pending`。
   */
  resetRunningJobsToPending(): number {
    const runningJobs = this.readJobs().filter((job) => job.status === "running");
    const now = Date.now();
    for (const job of runningJobs) {
      this.appendEvent({
        v: 1,
        type: "status",
        jobId: job.id,
        status: "pending",
        updatedAt: now,
      });
    }
    return runningJobs.length;
  }

  /**
   * 将任务标记为执行中。
   */
  markJobRunning(jobId: string): boolean {
    return this.transitionPendingJob(jobId, "running");
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
   * 取消待执行任务。
   */
  cancelPendingJob(jobId: string): boolean {
    return this.transitionPendingJob(jobId, "cancelled");
  }

  /**
   * 仅读取当前任务快照。
   */
  private readJobs(): ScheduledJobRecord[] {
    return [...this.readJobMap().values()];
  }

  /**
   * 重放事件流，构造当前任务快照。
   */
  private readJobMap(): Map<string, ScheduledJobRecord> {
    const jobs = new Map<string, ScheduledJobRecord>();
    for (const line of readJsonlLines(this.filePath)) {
      const event = parseEvent(line);
      if (!event) continue;
      if (event.type === "created") {
        jobs.set(event.job.id, normalizeJobRecord(event.job));
        continue;
      }
      const current = jobs.get(event.jobId);
      if (!current) continue;
      jobs.set(event.jobId, {
        ...current,
        status: event.status,
        updatedAt: event.updatedAt,
        ...(event.error ? { error: event.error } : {}),
        ...(event.status === "succeeded" || event.status === "cancelled"
          ? { error: undefined }
          : {}),
      });
    }
    return jobs;
  }

  /**
   * 追加单条事件。
   */
  private appendEvent(event: ScheduledJobEvent): void {
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf-8");
  }

  /**
   * 执行 pending -> target 的状态迁移。
   */
  private transitionPendingJob(
    jobId: string,
    status: "running" | "cancelled",
  ): boolean {
    const current = this.getJobById(jobId);
    if (!current || current.status !== "pending") {
      return false;
    }
    this.appendEvent({
      v: 1,
      type: "status",
      jobId: current.id,
      status,
      updatedAt: Date.now(),
    });
    return true;
  }

  /**
   * 统一写入终态。
   */
  private updateTerminalStatus(params: {
    jobId: string;
    status: Exclude<ScheduledJobStatus, "pending" | "running">;
    error?: string;
  }): boolean {
    const current = this.getJobById(params.jobId);
    if (!current) return false;
    this.appendEvent({
      v: 1,
      type: "status",
      jobId: current.id,
      status: params.status,
      updatedAt: Date.now(),
      ...(params.error ? { error: String(params.error) } : {}),
    });
    return true;
  }
}
