/**
 * `town plugin schedule` 命令。
 *
 * 关键点（中文）
 * - 命令名保留 schedule，是用户侧“延迟执行任务”的操作语义。
 * - 内部使用 Agent 的 ActionScheduleStore，不依赖独立 schedule plugin。
 * - 这里同时承载 schedule 子命令注册与 ActionSchedule 本地存储读写流程。
 */

import type { Command } from "commander";
import { ActionScheduleStore } from "@downcity/agent";
import { printResult } from "@/utils/cli/CliOutput.js";
import type { PluginCliBaseOptions } from "@downcity/agent";
import {
  addPluginScheduleOptions,
  normalizeScheduledJobStatus,
  parsePositiveIntOption,
  resolvePluginScheduleProjectRoot,
  validateAgentProjectRoot,
} from "./PluginTargetSupport.js";

/**
 * 执行 `plugin schedule list`。
 */
export async function runPluginScheduleListCommand(params: {
  options: PluginCliBaseOptions;
  statusRaw?: string;
  limitRaw?: string;
}): Promise<void> {
  const resolved = await resolvePluginScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin schedule list failed",
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
      title: "plugin schedule list failed",
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
    const store = new ActionScheduleStore(projectRoot);
    try {
      const jobs = store.listJobs({ status, limit });
      printResult({
        asJson: params.options.json,
        success: true,
        title: "plugin schedule listed",
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
      title: "plugin schedule list failed",
      payload: {
        error: String(error),
      },
    });
  }
}

/**
 * 执行 `plugin schedule info`。
 */
export async function runPluginScheduleInfoCommand(params: {
  jobId: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin schedule info failed",
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
      title: "plugin schedule info failed",
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
      title: "plugin schedule info failed",
      payload: {
        error: "jobId is required",
      },
    });
    return;
  }

  const store = new ActionScheduleStore(projectRoot);
  try {
    const job = store.getJobById(jobId);
    if (!job) {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "plugin schedule info failed",
        payload: {
          error: `Scheduled job not found: ${jobId}`,
        },
      });
      return;
    }
    printResult({
      asJson: params.options.json,
      success: true,
      title: "plugin schedule info ok",
      payload: {
        job,
      },
    });
  } finally {
    store.close();
  }
}

/**
 * 执行 `plugin schedule cancel`。
 */
export async function runPluginScheduleCancelCommand(params: {
  jobId: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginScheduleProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin schedule cancel failed",
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
      title: "plugin schedule cancel failed",
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
      title: "plugin schedule cancel failed",
      payload: {
        error: "jobId is required",
      },
    });
    return;
  }

  const store = new ActionScheduleStore(projectRoot);
  try {
    const current = store.getJobById(jobId);
    if (!current) {
      printResult({
        asJson: params.options.json,
        success: false,
        title: "plugin schedule cancel failed",
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
        title: "plugin schedule cancel failed",
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
        title: "plugin schedule cancel failed",
        payload: {
          error: `Failed to cancel scheduled job: ${jobId}`,
        },
      });
      return;
    }

    printResult({
      asJson: params.options.json,
      success: true,
      title: "plugin schedule cancelled",
      payload: {
        job: store.getJobById(jobId),
      },
    });
  } finally {
    store.close();
  }
}

/**
 * 注册 `plugin schedule` 子命令组。
 */
export function registerPluginScheduleCommands(plugin: Command): void {
  const schedule = plugin
    .command("schedule")
    .description("查看和管理持久化延迟 action 任务")
    .helpOption("--help", "display help for command");

  addPluginScheduleOptions(
    schedule
      .command("list")
      .description("列出当前 agent 的延迟 action 任务")
      .option("--status <status>", "状态过滤（pending|running|succeeded|failed|cancelled）")
      .option("--limit <n>", "返回条数（默认 100）"),
  ).action(async (opts: PluginCliBaseOptions & { status?: string; limit?: string }) => {
    await runPluginScheduleListCommand({
      options: opts,
      statusRaw: opts.status,
      limitRaw: opts.limit,
    });
  });

  addPluginScheduleOptions(
    schedule
      .command("info <jobId>")
      .description("查看单个延迟 action 任务详情"),
  ).action(async (jobId: string, opts: PluginCliBaseOptions) => {
    await runPluginScheduleInfoCommand({
      jobId,
      options: opts,
    });
  });

  addPluginScheduleOptions(
    schedule
      .command("cancel <jobId>")
      .description("取消一个尚未执行的延迟 action 任务"),
  ).action(async (jobId: string, opts: PluginCliBaseOptions) => {
    await runPluginScheduleCancelCommand({
      jobId,
      options: opts,
    });
  });
}
