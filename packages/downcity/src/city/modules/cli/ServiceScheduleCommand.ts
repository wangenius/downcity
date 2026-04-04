/**
 * `city service schedule` 命令。
 *
 * 关键点（中文）
 * - schedule 管理命令只依赖项目本地 schedule SQLite，不要求 runtime 在线。
 * - 这里同时承载 schedule 子命令注册与本地存储读写流程。
 */

import type { Command } from "commander";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import { ServiceScheduleStore } from "@/city/service/schedule/Store.js";
import type { ServiceCliBaseOptions } from "@/shared/types/Services.js";
import {
  addServiceScheduleOptions,
  normalizeScheduledJobStatus,
  parsePositiveIntOption,
  resolveScheduleProjectRoot,
  validateAgentProjectRoot,
} from "./ServiceCommandSupport.js";

/**
 * 执行 `service schedule list`。
 */
export async function runServiceScheduleListCommand(params: {
  options: ServiceCliBaseOptions;
  statusRaw?: string;
  limitRaw?: string;
}): Promise<void> {
  const resolved = await resolveScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule list failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule list failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }

  try {
    const status = normalizeScheduledJobStatus(params.statusRaw);
    const limit = params.limitRaw
      ? parsePositiveIntOption(params.limitRaw, "limit")
      : 100;
    const store = new ServiceScheduleStore(projectRoot);
    try {
      const jobs = store.listJobs({ status, limit });
      printResult({
        asJson: params.options.json,
        success: true,
        title: "service schedule listed",
        payload: {
          ...(status ? { status } : {}),
          limit,
          count: jobs.length,
          jobs,
        },
      });
    } finally {
      store.close();
    }
  } catch (error) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule list failed",
      payload: {
        error: String(error),
      },
    });
  }
}

/**
 * 执行 `service schedule info`。
 */
export async function runServiceScheduleInfoCommand(params: {
  jobId: string;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule info failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule info failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }

  const jobId = String(params.jobId || "").trim();
  if (!jobId) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule info failed",
      payload: {
        error: "jobId is required",
      },
    });
    return;
  }

  const store = new ServiceScheduleStore(projectRoot);
  try {
    const job = store.getJobById(jobId);
    if (!job) {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "service schedule info failed",
        payload: {
          error: `Scheduled job not found: ${jobId}`,
        },
      });
      return;
    }
    printResult({
      asJson: params.options.json,
      success: true,
      title: "service schedule info ok",
      payload: {
        job,
      },
    });
  } finally {
    store.close();
  }
}

/**
 * 执行 `service schedule cancel`。
 */
export async function runServiceScheduleCancelCommand(params: {
  jobId: string;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule cancel failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule cancel failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }

  const jobId = String(params.jobId || "").trim();
  if (!jobId) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service schedule cancel failed",
      payload: {
        error: "jobId is required",
      },
    });
    return;
  }

  const store = new ServiceScheduleStore(projectRoot);
  try {
    const current = store.getJobById(jobId);
    if (!current) {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "service schedule cancel failed",
        payload: {
          error: `Scheduled job not found: ${jobId}`,
        },
      });
      return;
    }
    if (current.status !== "pending") {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "service schedule cancel failed",
        payload: {
          error: `Only pending jobs can be cancelled. Current status: ${current.status}`,
          job: current,
        },
      });
      return;
    }

    const cancelled = store.cancelPendingJob(jobId);
    if (!cancelled) {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "service schedule cancel failed",
        payload: {
          error: `Failed to cancel scheduled job: ${jobId}`,
        },
      });
      return;
    }

    printResult({
      asJson: params.options.json,
      success: true,
      title: "service schedule cancelled",
      payload: {
        job: store.getJobById(jobId),
      },
    });
  } finally {
    store.close();
  }
}

/**
 * 注册 `service schedule` 子命令组。
 */
export function registerServiceScheduleCommands(service: Command): void {
  const schedule = service
    .command("schedule")
    .description("查看和管理持久化 schedule 任务")
    .helpOption("--help", "display help for command");

  addServiceScheduleOptions(
    schedule
      .command("list")
      .description("列出当前 agent 的调度任务")
      .option("--status <status>", "状态过滤（pending|running|succeeded|failed|cancelled）")
      .option("--limit <n>", "返回条数（默认 100）"),
  ).action(async (opts: ServiceCliBaseOptions & { status?: string; limit?: string }) => {
    await runServiceScheduleListCommand({
      options: opts,
      statusRaw: opts.status,
      limitRaw: opts.limit,
    });
  });

  addServiceScheduleOptions(
    schedule
      .command("info <jobId>")
      .description("查看单个调度任务详情"),
  ).action(async (jobId: string, opts: ServiceCliBaseOptions) => {
    await runServiceScheduleInfoCommand({
      jobId,
      options: opts,
    });
  });

  addServiceScheduleOptions(
    schedule
      .command("cancel <jobId>")
      .description("取消一个尚未执行的调度任务"),
  ).action(async (jobId: string, opts: ServiceCliBaseOptions) => {
    await runServiceScheduleCancelCommand({
      jobId,
      options: opts,
    });
  });
}
