/**
 * Task command services.
 *
 * 关键点（中文）
 * - 任务定义（task.md）与执行（runTaskNow）统一收口到服务层
 * - CLI 与 Server 共用同一份参数归一化/校验逻辑
 */

import path from "node:path";
import type { ShipTaskStatus } from "./types/Task.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import {
  deriveTaskIdFromTaskName,
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
    "- 尽量使用可审计的方式：关键中间产物写入 `./.ship/task/<task_name>/<timestamp>/` 下的 markdown 文件。",
    "",
  ].join("\n");
}

/**
 * 归一化语义文本（用于 task 去重）。
 *
 * 关键点（中文）
 * - 降噪：统一小写，移除空白与常见标点
 * - 不做语义模型推断，仅做轻量级字符串近似匹配
 */
function normalizeTaskSemanticText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(
      /[\s`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?，。！？；：、“”‘’（）【】《》、]/g,
      "",
    )
    .trim();
}

/**
 * 计算 Dice 系数（bigram），用于近似语义比对。
 */
function diceCoefficientByBigram(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const gramsA = new Map<string, number>();
  const gramsB = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const g = a.slice(i, i + 2);
    gramsA.set(g, (gramsA.get(g) || 0) + 1);
  }
  for (let i = 0; i < b.length - 1; i += 1) {
    const g = b.slice(i, i + 2);
    gramsB.set(g, (gramsB.get(g) || 0) + 1);
  }

  let overlap = 0;
  for (const [gram, countA] of gramsA) {
    const countB = gramsB.get(gram) || 0;
    overlap += Math.min(countA, countB);
  }
  const total = (a.length - 1) + (b.length - 1);
  if (total <= 0) return 0;
  return (2 * overlap) / total;
}

/**
 * 判断两个 task 描述是否属于“同语义/同场景/同目的”。
 *
 * 关键点（中文）
 * - 仅在同 contextId + 同 kind 下比较，避免跨渠道误合并
 * - 规则：
 *   1) 归一化后完全相等
 *   2) 一方包含另一方（长度足够）
 *   3) Dice 系数 >= 0.92 视为同语义
 */
function isSemanticallySameTask(params: {
  incomingTaskName: string;
  incomingDescription: string;
  existingTaskName: string;
  existingDescription: string;
}): boolean {
  const incoming = normalizeTaskSemanticText(
    `${params.incomingTaskName} ${params.incomingDescription}`,
  );
  const existing = normalizeTaskSemanticText(
    `${params.existingTaskName} ${params.existingDescription}`,
  );
  if (!incoming || !existing) return false;
  if (incoming === existing) return true;

  const minLen = Math.min(incoming.length, existing.length);
  if (
    minLen >= 12 &&
    (incoming.includes(existing) || existing.includes(incoming))
  ) {
    return true;
  }

  return diceCoefficientByBigram(incoming, existing) >= 0.92;
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
      taskName: task.taskName,
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

  const taskName = String(req.taskName || "").trim();
  const description = String(req.description || "").trim();
  let taskIdFromName = "";
  let taskId = "";
  try {
    taskIdFromName = deriveTaskIdFromTaskName(taskName);
    taskId = normalizeTaskId(taskIdFromName);
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
  const cronNormalized = normalizeTaskCron(String(req.cron || "@manual").trim() || "@manual");
  const contextId = String(req.contextId || "").trim();
  const kind = normalizeTaskKind(req.kind);
  const timeNormalized = normalizeTaskTime(req.time);
  const timezoneNormalized = normalizeTaskTimezone(req.timezone);

  if (!taskName) return { success: false, error: "Missing taskName" };
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

  // 关键点（中文）：防止同语义任务被重复创建。
  // 规则：同 contextId + 同 kind + 文本语义近似，直接复用已有任务。
  // 备注：显式 overwrite 仅用于同 taskId 覆盖，不用于放开“重复语义创建”。
  const existingTasks = await listTasks(root);
  const duplicated = existingTasks.find((item) => {
    const itemKind = item.kind || "agent";
    if (String(item.contextId || "").trim() !== contextId) return false;
    if (itemKind !== kind) return false;
    return isSemanticallySameTask({
      incomingTaskName: taskName,
      incomingDescription: description,
      existingTaskName: item.taskName,
      existingDescription: item.description,
    });
  });
  if (duplicated) {
    return {
      success: true,
      taskName: duplicated.taskName,
      taskMdPath: duplicated.taskMdPath,
      reusedExisting: true,
      message:
        "Detected existing task with same semantic goal in the same context; reused existing task instead of creating a duplicate.",
    };
  }

  try {
    const written = await writeTask({
      taskId,
      projectRoot: root,
      overwrite: Boolean(req.overwrite),
      frontmatter: {
        taskName,
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
      taskName,
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
  const taskName = String(req.taskName || "").trim();
  const taskId = normalizeTaskId(taskName);

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

    const nextTaskName =
      typeof req.taskNameNext === "string"
        ? req.taskNameNext.trim()
        : current.frontmatter.taskName;
    if (!nextTaskName) return { success: false, error: "taskName cannot be empty" };
    const nextTaskId = normalizeTaskId(deriveTaskIdFromTaskName(nextTaskName));
    if (nextTaskId !== taskId) {
      return {
        success: false,
        error: `taskName cannot change task identity. Expected "${taskId}", got "${nextTaskId}".`,
      };
    }

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
        taskName: nextTaskName,
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
      taskName: nextTaskName,
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
  const taskName = String(params.request.taskName || "").trim();
  const taskId = normalizeTaskId(taskName);
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
      taskName,
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
  const taskName = String(params.request.taskName || "").trim();
  const taskId = normalizeTaskId(taskName);
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
      taskName: task.frontmatter.taskName,
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
  const taskName = String(params.request.taskName || "").trim();
  const taskId = normalizeTaskId(taskName);

  try {
    const deleted = await deleteTask({
      projectRoot: root,
      taskId,
    });
    return {
      success: true,
      taskName,
      taskDirPath: deleted.taskDirPath,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}
