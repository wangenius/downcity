/**
 * Dashboard 任务与日志数据 helper。
 *
 * 关键点（中文）
 * - 聚合 logs 与 task runs 读取逻辑。
 * - 仅负责磁盘侧读取与 dashboard 视图映射。
 */

import fs from "fs-extra";
import path from "node:path";
import { getLogsDirPath, getDowncityTasksDirPath } from "@/main/city/env/Paths.js";
import { resolveTaskIdByTitle } from "@services/task/runtime/Store.js";
import type {
  DashboardLogEntry,
  DashboardTaskRunDetail,
  DashboardTaskRunSummary,
} from "@/shared/types/DashboardData.js";
import { truncateText } from "./CommonHelpers.js";
import { loadSessionMessagesFromFile, toUiMessageTimeline } from "./MessageTimeline.js";

export const TASK_RUN_DIR_REGEX = /^\d{8}-\d{6}-\d{3}$/;

/**
 * 读取近期日志。
 */
export async function readRecentLogs(params: {
  projectRoot: string;
  limit: number;
}): Promise<DashboardLogEntry[]> {
  const logsDir = getLogsDirPath(params.projectRoot);
  if (!(await fs.pathExists(logsDir))) return [];

  const files = (await fs.readdir(logsDir, { withFileTypes: true }))
    .filter((x) => x.isFile() && x.name.endsWith(".jsonl"))
    .map((x) => x.name)
    .sort()
    .reverse();

  const out: DashboardLogEntry[] = [];

  for (const fileName of files) {
    if (out.length >= params.limit) break;
    const abs = path.join(logsDir, fileName);
    const raw = await fs.readFile(abs, "utf-8").catch(() => "");
    const lines = raw.split("\n").filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (out.length >= params.limit) break;
      try {
        const parsed = JSON.parse(lines[index]) as DashboardLogEntry;
        if (!parsed || typeof parsed !== "object") continue;
        out.push({
          ...(typeof parsed.timestamp === "string" ? { timestamp: parsed.timestamp } : {}),
          ...(typeof parsed.type === "string" ? { type: parsed.type } : {}),
          ...(typeof parsed.level === "string" ? { level: parsed.level } : {}),
          ...(typeof parsed.message === "string" ? { message: parsed.message } : {}),
          ...(parsed.details && typeof parsed.details === "object"
            ? { details: parsed.details }
            : {}),
        });
      } catch {
        // ignore
      }
    }
  }

  return out;
}

async function resolveTaskDir(projectRoot: string, title: string): Promise<string> {
  const taskId = await resolveTaskIdByTitle({ projectRoot, title });
  return path.join(getDowncityTasksDirPath(projectRoot), taskId);
}

/**
 * 枚举任务运行摘要。
 */
export async function listTaskRuns(params: {
  projectRoot: string;
  title: string;
  limit: number;
}): Promise<DashboardTaskRunSummary[]> {
  const taskDir = await resolveTaskDir(params.projectRoot, params.title);
  if (!(await fs.pathExists(taskDir))) return [];

  const entries = await fs.readdir(taskDir, { withFileTypes: true });
  const timestamps = entries
    .filter((x) => x.isDirectory() && TASK_RUN_DIR_REGEX.test(x.name))
    .map((x) => x.name)
    .sort()
    .reverse()
    .slice(0, params.limit);

  const out: DashboardTaskRunSummary[] = [];

  for (const timestamp of timestamps) {
    const runDir = path.join(taskDir, timestamp);
    const metaPath = path.join(runDir, "run.json");
    const progressPath = path.join(runDir, "run-progress.json");
    const runDirRel = path.relative(params.projectRoot, runDir).split(path.sep).join("/");
    const meta = (await fs.readJson(metaPath).catch(() => null)) as {
      status?: string;
      executionStatus?: string;
      resultStatus?: string;
      startedAt?: number;
      endedAt?: number;
      dialogueRounds?: number;
      userSimulatorSatisfied?: boolean;
      error?: string;
    } | null;
    const progress = (await fs.readJson(progressPath).catch(() => null)) as {
      status?: string;
      phase?: string;
      message?: string;
      updatedAt?: number;
      round?: number;
      maxRounds?: number;
    } | null;

    const progressStatus =
      typeof progress?.status === "string" ? progress.status : undefined;
    const inProgress =
      progressStatus === "running" ||
      (!meta && (await fs.pathExists(progressPath)));
    const displayStatus =
      inProgress
        ? "running"
        : typeof meta?.status === "string"
          ? meta.status
          : progressStatus;

    out.push({
      timestamp,
      ...(typeof displayStatus === "string" ? { status: displayStatus } : {}),
      ...(typeof meta?.executionStatus === "string" ? { executionStatus: meta.executionStatus } : {}),
      ...(typeof meta?.resultStatus === "string" ? { resultStatus: meta.resultStatus } : {}),
      ...(inProgress ? { inProgress: true } : {}),
      ...(typeof progress?.phase === "string" ? { progressPhase: progress.phase } : {}),
      ...(typeof progress?.message === "string" ? { progressMessage: progress.message } : {}),
      ...(typeof progress?.updatedAt === "number" ? { progressUpdatedAt: progress.updatedAt } : {}),
      ...(typeof progress?.round === "number" ? { progressRound: progress.round } : {}),
      ...(typeof progress?.maxRounds === "number" ? { progressMaxRounds: progress.maxRounds } : {}),
      ...(typeof meta?.startedAt === "number" ? { startedAt: meta.startedAt } : {}),
      ...(typeof meta?.endedAt === "number" ? { endedAt: meta.endedAt } : {}),
      ...(typeof meta?.dialogueRounds === "number" ? { dialogueRounds: meta.dialogueRounds } : {}),
      ...(typeof meta?.userSimulatorSatisfied === "boolean"
        ? { userSimulatorSatisfied: meta.userSimulatorSatisfied }
        : {}),
      ...(typeof meta?.error === "string" ? { error: meta.error } : {}),
      runDirRel,
    });
  }

  return out;
}

/**
 * 读取任务运行详情。
 */
export async function readTaskRunDetail(params: {
  projectRoot: string;
  title: string;
  timestamp: string;
}): Promise<DashboardTaskRunDetail | null> {
  const taskDir = await resolveTaskDir(params.projectRoot, params.title);
  const runDir = path.join(taskDir, params.timestamp);
  if (!(await fs.pathExists(runDir))) return null;

  const readText = async (name: string, maxChars = 80_000): Promise<string | undefined> => {
    const abs = path.join(runDir, name);
    if (!(await fs.pathExists(abs))) return undefined;
    const raw = await fs.readFile(abs, "utf-8").catch(() => "");
    return truncateText(raw, maxChars);
  };

  const readJson = async <T>(name: string): Promise<T | undefined> => {
    const abs = path.join(runDir, name);
    if (!(await fs.pathExists(abs))) return undefined;
    return (await fs.readJson(abs).catch(() => undefined)) as T | undefined;
  };

  const messagesPath = path.join(runDir, "messages.jsonl");
  const messages = await loadSessionMessagesFromFile(messagesPath);
  const progress = await readJson<{
    status?: string;
    phase?: string;
    message?: string;
    startedAt?: number;
    updatedAt?: number;
    endedAt?: number;
    round?: number;
    maxRounds?: number;
    runStatus?: string;
    executionStatus?: string;
    resultStatus?: string;
    events?: Array<{
      at?: number;
      phase?: string;
      message?: string;
      round?: number;
      maxRounds?: number;
    }>;
  }>("run-progress.json");
  const outputText = (await readText("output.md")) || (await readText("result.md"));

  return {
    title: params.title,
    timestamp: params.timestamp,
    runDirRel: path.relative(params.projectRoot, runDir).split(path.sep).join("/"),
    meta: await readJson<Record<string, unknown>>("run.json"),
    ...(progress ? { progress } : {}),
    dialogue: await readJson<Record<string, unknown>>("dialogue.json"),
    artifacts: {
      input: await readText("input.md"),
      output: outputText,
      result: await readText("result.md"),
      dialogue: await readText("dialogue.md"),
      error: await readText("error.md"),
    },
    messages: messages.slice(-120).flatMap((message) => toUiMessageTimeline(message)),
  };
}
