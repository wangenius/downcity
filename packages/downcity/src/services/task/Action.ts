/**
 * Task command services.
 *
 * 关键点（中文）
 * - 任务定义（task.md）与执行（runTaskNow）统一收口到服务层
 * - CLI 与 Server 共用同一份参数归一化/校验逻辑
 */

import path from "node:path";
import type { ShipTaskStatus } from "./types/Task.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import {
  deriveTaskIdFromTitle,
  normalizeTaskId,
} from "./runtime/Paths.js";
import {
  normalizeTaskKind,
  normalizeTaskWhen,
  normalizeTaskStatus,
} from "./runtime/Model.js";
import {
  deleteTask,
  listTasks,
  readTask,
  resolveTaskIdByTitle,
  writeTask,
} from "./runtime/Store.js";
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
    "- 用清晰的步骤完成任务，并把关键结果写入本次 run 目录的 `result.md`。",
    "",
    "# 约束",
    "",
    "- 尽量使用可审计的方式：关键中间产物写入 `./.downcity/task/<title>/<timestamp>/` 下的 markdown 文件。",
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
      title: task.title,
      description: task.description,
      ...(typeof task.body === "string" && task.body.trim()
        ? { body: task.body }
        : {}),
      when: task.when,
      status: task.status,
      contextId: task.contextId,
      kind: task.kind || "agent",
      ...(task.kind === "agent" ? { review: Boolean(task.review) } : {}),
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

  const title = String(req.title || "").trim();
  const description = String(req.description || "").trim();
  let taskIdFromName = "";
  let taskId = "";
  try {
    taskIdFromName = deriveTaskIdFromTitle(title);
    taskId = normalizeTaskId(taskIdFromName);
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
  const whenNormalized = normalizeTaskWhen(String(req.when || "@manual").trim() || "@manual");
  const contextId = String(req.contextId || "").trim();
  const kind = normalizeTaskKind(req.kind);

  if (!title) return { success: false, error: "Missing title" };
  if (!description) return { success: false, error: "Missing description" };
  if (!contextId) return { success: false, error: "Missing contextId" };
  if (!whenNormalized.ok) return { success: false, error: whenNormalized.error };

  const status = resolveTaskStatus(req.status, "paused");
  const body =
    typeof req.body === "string" && req.body.trim()
      ? req.body.trim()
      : kind === "script"
        ? ""
        : buildDefaultTaskBody();
  // 关键点（中文）：`title` 是唯一键，create 去重只按 title 精确匹配。
  const existingTasks = await listTasks(root);
  const duplicated = existingTasks.find((item) => String(item.title || "").trim() === title);
  if (duplicated && !req.overwrite) {
    return {
      success: true,
      title: duplicated.title,
      taskMdPath: duplicated.taskMdPath,
      reusedExisting: true,
      message: "Task title already exists; reused existing task.",
    };
  }
  const targetTaskId = duplicated ? duplicated.taskId : taskId;

  try {
    const written = await writeTask({
      taskId: targetTaskId,
      projectRoot: root,
      overwrite: Boolean(req.overwrite) || Boolean(duplicated),
      frontmatter: {
        title,
        description,
        when: whenNormalized.value,
        contextId,
        kind,
        ...(kind === "agent" && req.review === true ? { review: true } : {}),
        status,
      },
      body,
    });

    return {
      success: true,
      title,
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
  const title = String(req.title || "").trim();
  let taskId = "";
  try {
    taskId = await resolveTaskIdByTitle({ projectRoot: root, title });
  } catch (error) {
    return { success: false, error: String(error) };
  }

  // 关键点（中文）：API 层也做一次互斥校验，避免非 CLI 调用写入歧义状态。
  if (req.body !== undefined && req.clearBody) {
    return { success: false, error: "`body` conflicts with `clearBody`" };
  }
  if (req.when !== undefined && req.clearWhen) {
    return { success: false, error: "`when` conflicts with `clearWhen`" };
  }

  try {
    const current = await readTask({
      projectRoot: root,
      taskId,
    });

    const nextTitle =
      typeof req.titleNext === "string"
        ? req.titleNext.trim()
        : current.frontmatter.title;
    if (!nextTitle) return { success: false, error: "title cannot be empty" };
    const nextTaskId = normalizeTaskId(deriveTaskIdFromTitle(nextTitle));
    if (nextTaskId !== taskId) {
      return {
        success: false,
        error: `title cannot change task identity. Expected "${taskId}", got "${nextTaskId}".`,
      };
    }

    const description =
      typeof req.description === "string"
        ? req.description.trim()
        : current.frontmatter.description;
    if (!description) return { success: false, error: "description cannot be empty" };

    const whenInput = req.clearWhen
      ? "@manual"
      : typeof req.when === "string"
        ? req.when.trim()
        : current.frontmatter.when;
    const whenNormalized = normalizeTaskWhen(whenInput);
    if (!whenNormalized.ok) return { success: false, error: whenNormalized.error };

    const contextId =
      typeof req.contextId === "string" ? req.contextId.trim() : current.frontmatter.contextId;
    if (!contextId) return { success: false, error: "contextId cannot be empty" };
    const kind = normalizeTaskKind(
      req.kind === undefined ? current.frontmatter.kind : req.kind,
    );
    const review =
      kind === "agent"
        ? req.review === undefined
          ? Boolean(current.frontmatter.review)
          : req.review === true
        : false;

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
        title: nextTitle,
        description,
        when: whenNormalized.value,
        contextId,
        kind,
        ...(kind === "agent" && review ? { review: true } : {}),
        status,
      },
      body,
    });

    return {
      success: true,
      title: nextTitle,
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
  const title = String(params.request.title || "").trim();
  let taskId = "";
  try {
    taskId = await resolveTaskIdByTitle({ projectRoot: root, title });
  } catch (error) {
    return { success: false, error: String(error) };
  }
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

    const executionId = `${taskId}:${Date.now()}`;
    void runTaskNow({
      context: params.context,
      projectRoot: root,
      taskId,
      trigger,
      executionId,
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
            executionId: result.executionId,
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
      // 关键点（中文）：这里直接返回给 agent 作为 tool result，提醒它这是异步任务，无需等待完成即可继续后续流程。
      message: "任务已经开始执行，完成后 task 会自动发送给用户。请直接继续后续流程，无需等待 task 完成。",
      executionId,
      title,
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
  const title = String(params.request.title || "").trim();
  let taskId = "";
  try {
    taskId = await resolveTaskIdByTitle({ projectRoot: root, title });
  } catch (error) {
    return { success: false, error: String(error) };
  }
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
      title: task.frontmatter.title,
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
  const title = String(params.request.title || "").trim();
  let taskId = "";
  try {
    taskId = await resolveTaskIdByTitle({ projectRoot: root, title });
  } catch (error) {
    return { success: false, error: String(error) };
  }

  try {
    const deleted = await deleteTask({
      projectRoot: root,
      taskId,
    });
    return {
      success: true,
      title,
      taskDirPath: deleted.taskDirPath,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}
