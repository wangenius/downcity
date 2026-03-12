/**
 * Task command services.
 *
 * 关键点（中文）
 * - 任务定义（task.md）与执行（runTaskNow）统一收口到服务层
 * - CLI 与 Server 共用同一份参数归一化/校验逻辑
 */

import path from "node:path";
import { nanoid } from "nanoid";
import type { ShipTaskStatus } from "./types/Task.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import {
  isValidTaskId,
  normalizeTaskId,
} from "./runtime/Paths.js";
import {
  normalizeTaskCron,
  normalizeMaxDialogueRounds,
  normalizeMinOutputChars,
  normalizeRequiredArtifacts,
  normalizeTaskKind,
  normalizeTaskTime,
  normalizeTaskTimezone,
  normalizeTaskStatus,
  validateTaskScheduleCombination,
} from "./runtime/Model.js";
import { deleteTask, listTasks, readTask, writeTask } from "./runtime/Store.js";
import { runTaskNow } from "./runtime/Runner.js";
import type {
  TaskCreateRequest,
  TaskCreateResponse,
  TaskDeleteRequest,
  TaskDeleteResponse,
  TaskListResponse,
  TaskRunRequest,
  TaskRunResponse,
  TaskUpdateRequest,
  TaskUpdateResponse,
  TaskSetStatusRequest,
  TaskSetStatusResponse,
} from "./types/TaskCommand.js";

function resolveTaskStatus(input: JsonValue | undefined, fallback: ShipTaskStatus): ShipTaskStatus {
  const normalized = normalizeTaskStatus(input);
  return normalized || fallback;
}

const TASK_LOG_PREFIX = "[TASK]";

function formatTaskLogMessage(message: string): string {
  return `${TASK_LOG_PREFIX} ${message}`;
}

function buildDefaultTaskBody(): string {
  return [
    "# 任务目标",
    "",
    "- 用清晰的步骤完成任务，并把关键结果写入本次 run 目录的 `result.md`（必要时也写 `output.md`）。",
    "",
    "# 约束",
    "",
    "- 尽量使用可审计的方式：关键中间产物写入 `./.ship/task/<taskId>/<timestamp>/` 下的 markdown 文件。",
    "",
  ].join("\n");
}

export async function listTaskDefinitions(params: {
  projectRoot: string;
  status?: ShipTaskStatus;
}): Promise<TaskListResponse> {
  const root = path.resolve(params.projectRoot);
  const normalizedStatus = normalizeTaskStatus(params.status);

  const tasks = await listTasks(root);
  const filtered = normalizedStatus
    ? tasks.filter((task) => String(task.status).toLowerCase() === normalizedStatus)
    : tasks;

  return {
    success: true,
    tasks: filtered.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      cron: task.cron,
      status: task.status,
      contextId: task.contextId,
      kind: task.kind || "agent",
      ...(task.time ? { time: task.time } : {}),
      ...(task.timezone ? { timezone: task.timezone } : {}),
      ...(Array.isArray(task.requiredArtifacts) && task.requiredArtifacts.length > 0
        ? { requiredArtifacts: task.requiredArtifacts }
        : {}),
      ...(typeof task.minOutputChars === "number" ? { minOutputChars: task.minOutputChars } : {}),
      ...(typeof task.maxDialogueRounds === "number" ? { maxDialogueRounds: task.maxDialogueRounds } : {}),
      taskMdPath: task.taskMdPath,
      ...(task.lastRunTimestamp ? { lastRunTimestamp: task.lastRunTimestamp } : {}),
    })),
  };
}

export async function createTaskDefinition(params: {
  projectRoot: string;
  request: TaskCreateRequest;
}): Promise<TaskCreateResponse> {
  const root = path.resolve(params.projectRoot);
  const req = params.request;

  const rawTaskId = String(req.taskId || "").trim();
  const taskId = rawTaskId && isValidTaskId(rawTaskId)
    ? normalizeTaskId(rawTaskId)
    : `task-${nanoid(10)}`;

  const title = String(req.title || "").trim();
  const description = String(req.description || "").trim();
  const cronNormalized = normalizeTaskCron(String(req.cron || "@manual").trim() || "@manual");
  const contextId = String(req.contextId || "").trim();
  const kind = normalizeTaskKind(req.kind);
  const timeNormalized = normalizeTaskTime(req.time);
  const timezoneNormalized = normalizeTaskTimezone(req.timezone);

  if (!title) return { success: false, error: "Missing title" };
  if (!description) return { success: false, error: "Missing description" };
  if (!contextId) return { success: false, error: "Missing contextId" };
  if (!cronNormalized.ok) return { success: false, error: cronNormalized.error };
  if (!timeNormalized.ok) return { success: false, error: timeNormalized.error };
  if (!timezoneNormalized.ok) return { success: false, error: timezoneNormalized.error };
  const scheduleCombination = validateTaskScheduleCombination({
    cron: cronNormalized.value,
    time: timeNormalized.value,
  });
  if (!scheduleCombination.ok) {
    return { success: false, error: scheduleCombination.error };
  }

  const status = resolveTaskStatus(req.status, "paused");
  const body =
    typeof req.body === "string" && req.body.trim()
      ? req.body.trim()
      : kind === "script"
        ? ""
        : buildDefaultTaskBody();
  const requiredArtifactsNormalized = normalizeRequiredArtifacts(req.requiredArtifacts);
  if (!requiredArtifactsNormalized.ok) return { success: false, error: requiredArtifactsNormalized.error };
  const minOutputCharsNormalized = normalizeMinOutputChars(req.minOutputChars);
  if (!minOutputCharsNormalized.ok) return { success: false, error: minOutputCharsNormalized.error };
  const maxDialogueRoundsNormalized = normalizeMaxDialogueRounds(req.maxDialogueRounds);
  if (!maxDialogueRoundsNormalized.ok) return { success: false, error: maxDialogueRoundsNormalized.error };

  try {
    const written = await writeTask({
      taskId,
      projectRoot: root,
      overwrite: Boolean(req.overwrite),
      frontmatter: {
        title,
        description,
        cron: cronNormalized.value,
        contextId,
        kind,
        ...(timeNormalized.value ? { time: timeNormalized.value } : {}),
        status,
        ...(timezoneNormalized.value ? { timezone: timezoneNormalized.value } : {}),
        ...(requiredArtifactsNormalized.value.length > 0
          ? { requiredArtifacts: requiredArtifactsNormalized.value }
          : {}),
        ...(typeof minOutputCharsNormalized.value === "number"
          ? { minOutputChars: minOutputCharsNormalized.value }
          : {}),
        ...(typeof maxDialogueRoundsNormalized.value === "number"
          ? { maxDialogueRounds: maxDialogueRoundsNormalized.value }
          : {}),
      },
      body,
    });

    return {
      success: true,
      taskId: written.taskId,
      taskMdPath: written.taskMdPath,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export async function updateTaskDefinition(params: {
  projectRoot: string;
  request: TaskUpdateRequest;
}): Promise<TaskUpdateResponse> {
  const root = path.resolve(params.projectRoot);
  const req = params.request;
  const taskId = normalizeTaskId(String(req.taskId || "").trim());

  // 关键点（中文）：API 层也做一次互斥校验，避免非 CLI 调用写入歧义状态。
  if (req.timezone !== undefined && req.clearTimezone) {
    return { success: false, error: "`timezone` conflicts with `clearTimezone`" };
  }
  if (req.requiredArtifacts !== undefined && req.clearRequiredArtifacts) {
    return { success: false, error: "`requiredArtifacts` conflicts with `clearRequiredArtifacts`" };
  }
  if (req.minOutputChars !== undefined && req.clearMinOutputChars) {
    return { success: false, error: "`minOutputChars` conflicts with `clearMinOutputChars`" };
  }
  if (req.maxDialogueRounds !== undefined && req.clearMaxDialogueRounds) {
    return { success: false, error: "`maxDialogueRounds` conflicts with `clearMaxDialogueRounds`" };
  }
  if (req.body !== undefined && req.clearBody) {
    return { success: false, error: "`body` conflicts with `clearBody`" };
  }
  if (req.time !== undefined && req.clearTime) {
    return { success: false, error: "`time` conflicts with `clearTime`" };
  }

  try {
    const current = await readTask({
      projectRoot: root,
      taskId,
    });

    const title =
      typeof req.title === "string" ? req.title.trim() : current.frontmatter.title;
    if (!title) return { success: false, error: "title cannot be empty" };

    const description =
      typeof req.description === "string"
        ? req.description.trim()
        : current.frontmatter.description;
    if (!description) return { success: false, error: "description cannot be empty" };

    const cronInput =
      typeof req.cron === "string" ? req.cron.trim() : current.frontmatter.cron;
    const cronNormalized = normalizeTaskCron(cronInput);
    if (!cronNormalized.ok) return { success: false, error: cronNormalized.error };

    const contextId =
      typeof req.contextId === "string" ? req.contextId.trim() : current.frontmatter.contextId;
    if (!contextId) return { success: false, error: "contextId cannot be empty" };
    const kind = normalizeTaskKind(
      req.kind === undefined ? current.frontmatter.kind : req.kind,
    );
    const timeInput = req.clearTime
      ? undefined
      : req.time !== undefined
        ? req.time
        : current.frontmatter.time;
    const timeNormalized = normalizeTaskTime(timeInput);
    if (!timeNormalized.ok) return { success: false, error: timeNormalized.error };

    const status =
      req.status === undefined
        ? current.frontmatter.status
        : normalizeTaskStatus(req.status);
    if (!status) {
      return {
        success: false,
        error: `Invalid status: ${String(req.status)}`,
      };
    }

    let timezoneInput: string | undefined;
    if (req.clearTimezone) {
      timezoneInput = undefined;
    } else if (typeof req.timezone === "string") {
      const t = req.timezone.trim();
      if (!t) {
        return {
          success: false,
          error: "timezone cannot be empty (use clearTimezone to unset)",
        };
      }
      timezoneInput = t;
    } else {
      timezoneInput = current.frontmatter.timezone;
    }
    const timezoneNormalized = normalizeTaskTimezone(timezoneInput);
    if (!timezoneNormalized.ok) {
      return { success: false, error: timezoneNormalized.error };
    }
    const scheduleCombination = validateTaskScheduleCombination({
      cron: cronNormalized.value,
      time: timeNormalized.value,
    });
    if (!scheduleCombination.ok) {
      return { success: false, error: scheduleCombination.error };
    }

    let requiredArtifacts: string[] = [];
    if (req.clearRequiredArtifacts) {
      requiredArtifacts = [];
    } else if (req.requiredArtifacts !== undefined) {
      const normalized = normalizeRequiredArtifacts(req.requiredArtifacts);
      if (!normalized.ok) return { success: false, error: normalized.error };
      requiredArtifacts = normalized.value;
    } else {
      requiredArtifacts = Array.isArray(current.frontmatter.requiredArtifacts)
        ? current.frontmatter.requiredArtifacts
        : [];
    }

    let minOutputChars: number | undefined;
    if (req.clearMinOutputChars) {
      minOutputChars = undefined;
    } else if (req.minOutputChars !== undefined) {
      const normalized = normalizeMinOutputChars(req.minOutputChars);
      if (!normalized.ok) return { success: false, error: normalized.error };
      minOutputChars = normalized.value;
    } else {
      minOutputChars = current.frontmatter.minOutputChars;
    }

    let maxDialogueRounds: number | undefined;
    if (req.clearMaxDialogueRounds) {
      maxDialogueRounds = undefined;
    } else if (req.maxDialogueRounds !== undefined) {
      const normalized = normalizeMaxDialogueRounds(req.maxDialogueRounds);
      if (!normalized.ok) return { success: false, error: normalized.error };
      maxDialogueRounds = normalized.value;
    } else {
      maxDialogueRounds = current.frontmatter.maxDialogueRounds;
    }

    const body = req.clearBody
      ? ""
      : typeof req.body === "string"
        ? req.body.trim()
        : current.body;

    const written = await writeTask({
      projectRoot: root,
      taskId,
      overwrite: true,
      frontmatter: {
        title,
        description,
        cron: cronNormalized.value,
        contextId,
        kind,
        ...(timeNormalized.value ? { time: timeNormalized.value } : {}),
        status,
        ...(timezoneNormalized.value ? { timezone: timezoneNormalized.value } : {}),
        ...(requiredArtifacts.length > 0 ? { requiredArtifacts } : {}),
        ...(typeof minOutputChars === "number" ? { minOutputChars } : {}),
        ...(typeof maxDialogueRounds === "number" ? { maxDialogueRounds } : {}),
      },
      body,
    });

    return {
      success: true,
      taskId: written.taskId,
      taskMdPath: written.taskMdPath,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export async function runTaskDefinition(params: {
  context: ServiceRuntime;
  projectRoot: string;
  request: TaskRunRequest;
}): Promise<TaskRunResponse> {
  const root = path.resolve(params.projectRoot);
  const taskId = normalizeTaskId(String(params.request.taskId || "").trim());
  const reason = typeof params.request.reason === "string" ? params.request.reason.trim() : "";
  const trigger = {
    type: "manual" as const,
    ...(reason ? { reason } : {}),
  };

  try {
    // 关键点（中文）：run 改为“异步受理”，先做存在性校验，再后台执行。
    await readTask({
      taskId,
      projectRoot: root,
    });

    params.context.logger.info(
      formatTaskLogMessage("Manual task run accepted"),
      {
        taskId,
        via: "manual",
        ...(reason ? { reason } : {}),
      },
    );

    void runTaskNow({
      context: params.context,
      projectRoot: root,
      taskId,
      trigger,
    })
      .then((result) => {
        params.context.logger.info(
          formatTaskLogMessage("Manual task run finished"),
          {
            taskId,
            via: "manual",
            status: result.status,
            executionStatus: result.executionStatus,
            resultStatus: result.resultStatus,
            ...(result.resultErrors.length > 0
              ? { resultErrors: result.resultErrors }
              : {}),
            dialogueRounds: result.dialogueRounds,
            userSimulatorSatisfied: result.userSimulatorSatisfied,
            timestamp: result.timestamp,
            runDir: result.runDirRel,
          },
        );
      })
      .catch((error) => {
        params.context.logger.error(
          formatTaskLogMessage("Manual task run failed"),
          {
            taskId,
            via: "manual",
            error: String(error),
          },
        );
      });

    return {
      success: true,
      accepted: true,
      message: "任务已经开始执行",
      taskId,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export async function setTaskStatus(params: {
  projectRoot: string;
  request: TaskSetStatusRequest;
}): Promise<TaskSetStatusResponse> {
  const root = path.resolve(params.projectRoot);
  const taskId = normalizeTaskId(String(params.request.taskId || "").trim());
  const status = normalizeTaskStatus(params.request.status);

  if (!status) {
    return {
      success: false,
      error: `Invalid status: ${String(params.request.status)}`,
    };
  }

  try {
    const task = await readTask({
      projectRoot: root,
      taskId,
    });

    await writeTask({
      projectRoot: root,
      taskId,
      overwrite: true,
      frontmatter: {
        ...task.frontmatter,
        status,
      },
      body: task.body,
    });

    return {
      success: true,
      taskId,
      status,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export async function deleteTaskDefinition(params: {
  projectRoot: string;
  request: TaskDeleteRequest;
}): Promise<TaskDeleteResponse> {
  const root = path.resolve(params.projectRoot);
  const taskId = normalizeTaskId(String(params.request.taskId || "").trim());

  try {
    const deleted = await deleteTask({
      projectRoot: root,
      taskId,
    });
    return {
      success: true,
      taskId: deleted.taskId,
      taskDirPath: deleted.taskDirPath,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}
