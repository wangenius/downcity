/**
 * Task service.
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/task/<action>`
 * - 任务执行与定义管理统一收口到 `services/task/Action.ts`
 */

import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
  createTaskDefinition,
  deleteTaskDefinition,
  listTaskDefinitions,
  runTaskDefinition,
  updateTaskDefinition,
  setTaskStatus,
} from "./Action.js";
import { resolveContextId } from "@main/context/manager/ContextId.js";
import type { Service } from "@main/service/ServiceManager.js";
import type { ShipTaskKind, ShipTaskStatus } from "./types/Task.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type {
  TaskCreateRequest,
  TaskDeleteRequest,
  TaskRunRequest,
  TaskSetStatusRequest,
  TaskUpdateRequest,
} from "./types/TaskCommand.js";
import {
  restartTaskCronRuntime,
  startTaskCronRuntime,
  stopTaskCronRuntime,
} from "./runtime/CronRuntime.js";

type TaskListPayload = {
  status?: ShipTaskStatus;
};

const TASK_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);
const TASK_LOG_PREFIX = "[TASK]";

function formatTaskLogMessage(message: string): string {
  return `${TASK_LOG_PREFIX} ${message}`;
}

/**
 * 加载 task service 使用说明提示词。
 *
 * 关键点（中文）
 * - 在模块初始化时读取，确保运行时行为稳定且可预期。
 */
function loadTaskServicePrompt(): string {
  try {
    return readFileSync(TASK_PROMPT_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load task service prompt from ${TASK_PROMPT_FILE_URL.pathname}: ${reason}`,
    );
  }
}

const TASK_SERVICE_PROMPT = loadTaskServicePrompt();

function parseNonNegativeIntOption(value: string): number {
  const s = String(value || "").trim();
  if (!/^\d+$/.test(s)) {
    throw new Error(`Invalid non-negative integer: ${value}`);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid non-negative integer: ${value}`);
  }
  return n;
}

function parsePositiveIntOption(value: string): number {
  const n = parseNonNegativeIntOption(value);
  if (n < 1) throw new Error(`Invalid positive integer: ${value}`);
  return n;
}

function collectStringOption(value: string, previous: string[] = []): string[] {
  const item = String(value || "").trim();
  if (!item) return previous;
  return [...previous, item];
}

function parseJsonBodyObject(rawBody: JsonValue): JsonObject {
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody as JsonObject;
  }
  return {};
}

function getStringField(body: JsonObject, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function getOptionalStringField(
  body: JsonObject,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanField(body: JsonObject, key: string): boolean {
  return body[key] === true;
}

function getOptionalNumberField(
  body: JsonObject,
  key: string,
): number | undefined {
  const value = body[key];
  return typeof value === "number" ? value : undefined;
}

function getOptionalStringArrayField(
  body: JsonObject,
  key: string,
): string[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function getOptionalTaskStatusField(
  body: JsonObject,
  key: string,
): ShipTaskStatus | undefined {
  const value = body[key];
  if (value === "enabled" || value === "paused" || value === "disabled") {
    return value;
  }
  return undefined;
}

function getOptionalTaskKindField(
  body: JsonObject,
  key: string,
): ShipTaskKind | undefined {
  const value = body[key];
  if (value === "agent" || value === "script") {
    return value;
  }
  return undefined;
}

function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

function getNumberOpt(
  opts: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = opts[key];
  return typeof value === "number" ? value : undefined;
}

function getStringArrayOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string[] | undefined {
  const value = opts[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function readTaskStatusOrThrow(value?: string): ShipTaskStatus | undefined {
  if (!value) return undefined;
  if (value === "enabled" || value === "paused" || value === "disabled") {
    return value;
  }
  throw new Error(`Invalid task status: ${value}`);
}

function readTaskKindOrThrow(value?: string): ShipTaskKind | undefined {
  if (!value) return undefined;
  if (value === "agent" || value === "script") {
    return value;
  }
  throw new Error(`Invalid task kind: ${value}`);
}

function resolveContextIdOrThrow(input?: string): string {
  const contextId = resolveContextId({ contextId: input });
  if (!contextId) {
    throw new Error(
      "Missing contextId. Provide --context-id or ensure SMA_CTX_CONTEXT_ID is available.",
    );
  }
  return contextId;
}

function mapTaskListCommandInput(
  opts: Record<string, JsonValue>,
): TaskListPayload {
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  return status ? { status } : {};
}

function mapTaskCreateCommandInput(
  opts: Record<string, JsonValue>,
): TaskCreateRequest {
  const title = String(getStringOpt(opts, "title") || "").trim();
  const description = String(getStringOpt(opts, "description") || "").trim();
  if (!title) throw new Error("Missing title");
  if (!description) throw new Error("Missing description");

  const contextId = resolveContextIdOrThrow(getStringOpt(opts, "contextId"));
  const kind = readTaskKindOrThrow(getStringOpt(opts, "kind"));
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  const requiredArtifacts = getStringArrayOpt(opts, "requiredArtifact");

  return {
    ...(getStringOpt(opts, "taskId")
      ? { taskId: getStringOpt(opts, "taskId") }
      : {}),
    title,
    cron: String(getStringOpt(opts, "cron") || "@manual").trim() || "@manual",
    description,
    contextId,
    ...(kind ? { kind } : {}),
    ...(typeof getStringOpt(opts, "time") === "string"
      ? { time: getStringOpt(opts, "time") }
      : {}),
    ...(status ? { status } : {}),
    ...(getStringOpt(opts, "timezone")
      ? { timezone: getStringOpt(opts, "timezone") }
      : {}),
    ...(Array.isArray(requiredArtifacts) && requiredArtifacts.length > 0
      ? { requiredArtifacts }
      : {}),
    ...(typeof getNumberOpt(opts, "minOutputChars") === "number"
      ? { minOutputChars: getNumberOpt(opts, "minOutputChars") }
      : {}),
    ...(typeof getNumberOpt(opts, "maxDialogueRounds") === "number"
      ? { maxDialogueRounds: getNumberOpt(opts, "maxDialogueRounds") }
      : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    overwrite: getBooleanOpt(opts, "overwrite") === true,
  };
}

function mapTaskUpdateCommandInput(params: {
  taskId: string;
  opts: Record<string, JsonValue>;
}): TaskUpdateRequest {
  const opts = params.opts;
  const kind = readTaskKindOrThrow(getStringOpt(opts, "kind"));
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  const requiredArtifacts = getStringArrayOpt(opts, "requiredArtifact");

  // 关键点（中文）：set 与 clear 选项互斥，提前在命令入口做校验。
  const conflicts: string[] = [];
  if (
    typeof getStringOpt(opts, "timezone") === "string" &&
    getBooleanOpt(opts, "clearTimezone")
  ) {
    conflicts.push("`--timezone` conflicts with `--clear-timezone`");
  }
  if (
    Array.isArray(requiredArtifacts) &&
    requiredArtifacts.length > 0 &&
    getBooleanOpt(opts, "clearRequiredArtifacts")
  ) {
    conflicts.push(
      "`--required-artifact` conflicts with `--clear-required-artifacts`",
    );
  }
  if (
    typeof getNumberOpt(opts, "minOutputChars") === "number" &&
    getBooleanOpt(opts, "clearMinOutputChars")
  ) {
    conflicts.push(
      "`--min-output-chars` conflicts with `--clear-min-output-chars`",
    );
  }
  if (
    typeof getNumberOpt(opts, "maxDialogueRounds") === "number" &&
    getBooleanOpt(opts, "clearMaxDialogueRounds")
  ) {
    conflicts.push(
      "`--max-dialogue-rounds` conflicts with `--clear-max-dialogue-rounds`",
    );
  }
  if (
    typeof getStringOpt(opts, "body") === "string" &&
    getBooleanOpt(opts, "clearBody")
  ) {
    conflicts.push("`--body` conflicts with `--clear-body`");
  }
  if (
    typeof getStringOpt(opts, "time") === "string" &&
    getBooleanOpt(opts, "clearTime")
  ) {
    conflicts.push("`--time` conflicts with `--clear-time`");
  }
  if (conflicts.length > 0) {
    throw new Error(conflicts.join("; "));
  }

  const hasUpdate =
    typeof getStringOpt(opts, "title") === "string" ||
    typeof getStringOpt(opts, "cron") === "string" ||
    typeof getStringOpt(opts, "description") === "string" ||
    typeof getStringOpt(opts, "contextId") === "string" ||
    typeof kind === "string" ||
    typeof getStringOpt(opts, "time") === "string" ||
    getBooleanOpt(opts, "clearTime") === true ||
    typeof status === "string" ||
    typeof getStringOpt(opts, "timezone") === "string" ||
    getBooleanOpt(opts, "clearTimezone") === true ||
    (Array.isArray(requiredArtifacts) && requiredArtifacts.length > 0) ||
    getBooleanOpt(opts, "clearRequiredArtifacts") === true ||
    typeof getNumberOpt(opts, "minOutputChars") === "number" ||
    getBooleanOpt(opts, "clearMinOutputChars") === true ||
    typeof getNumberOpt(opts, "maxDialogueRounds") === "number" ||
    getBooleanOpt(opts, "clearMaxDialogueRounds") === true ||
    typeof getStringOpt(opts, "body") === "string" ||
    getBooleanOpt(opts, "clearBody") === true;

  if (!hasUpdate) {
    throw new Error("No update fields provided");
  }

  return {
    taskId: String(params.taskId || "").trim(),
    ...(typeof getStringOpt(opts, "title") === "string"
      ? { title: getStringOpt(opts, "title") }
      : {}),
    ...(typeof getStringOpt(opts, "cron") === "string"
      ? { cron: getStringOpt(opts, "cron") }
      : {}),
    ...(typeof getStringOpt(opts, "description") === "string"
      ? { description: getStringOpt(opts, "description") }
      : {}),
    ...(typeof getStringOpt(opts, "contextId") === "string"
      ? { contextId: getStringOpt(opts, "contextId") }
      : {}),
    ...(typeof kind === "string" ? { kind } : {}),
    ...(typeof getStringOpt(opts, "time") === "string"
      ? { time: getStringOpt(opts, "time") }
      : {}),
    ...(getBooleanOpt(opts, "clearTime") ? { clearTime: true } : {}),
    ...(typeof status === "string" ? { status } : {}),
    ...(typeof getStringOpt(opts, "timezone") === "string"
      ? { timezone: getStringOpt(opts, "timezone") }
      : {}),
    ...(getBooleanOpt(opts, "clearTimezone") ? { clearTimezone: true } : {}),
    ...(Array.isArray(requiredArtifacts) ? { requiredArtifacts } : {}),
    ...(getBooleanOpt(opts, "clearRequiredArtifacts")
      ? { clearRequiredArtifacts: true }
      : {}),
    ...(typeof getNumberOpt(opts, "minOutputChars") === "number"
      ? { minOutputChars: getNumberOpt(opts, "minOutputChars") }
      : {}),
    ...(getBooleanOpt(opts, "clearMinOutputChars")
      ? { clearMinOutputChars: true }
      : {}),
    ...(typeof getNumberOpt(opts, "maxDialogueRounds") === "number"
      ? { maxDialogueRounds: getNumberOpt(opts, "maxDialogueRounds") }
      : {}),
    ...(getBooleanOpt(opts, "clearMaxDialogueRounds")
      ? { clearMaxDialogueRounds: true }
      : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    ...(getBooleanOpt(opts, "clearBody") ? { clearBody: true } : {}),
  };
}

function mapTaskSetStatusCommandInput(params: {
  taskId: string;
  status: ShipTaskStatus;
}): TaskSetStatusRequest {
  return {
    taskId: String(params.taskId || "").trim(),
    status: params.status,
  };
}

function mapTaskDeleteCommandInput(taskIdInput: string): TaskDeleteRequest {
  const taskId = String(taskIdInput || "").trim();
  if (!taskId) throw new Error("Missing taskId");
  return { taskId };
}

function mapTaskListApiInput(query: { status?: string }): TaskListPayload {
  const status = readTaskStatusOrThrow(
    typeof query.status === "string" ? query.status.trim() : undefined,
  );
  return status ? { status } : {};
}

function mapTaskCreateApiInput(body: JsonObject): TaskCreateRequest {
  return {
    taskId: getOptionalStringField(body, "taskId"),
    title: getStringField(body, "title"),
    cron: getStringField(body, "cron"),
    description: getStringField(body, "description"),
    contextId: getStringField(body, "contextId"),
    kind: getOptionalTaskKindField(body, "kind"),
    time: getOptionalStringField(body, "time"),
    status: getOptionalTaskStatusField(body, "status"),
    timezone: getOptionalStringField(body, "timezone"),
    body: getOptionalStringField(body, "body"),
    requiredArtifacts: getOptionalStringArrayField(body, "requiredArtifacts"),
    minOutputChars: getOptionalNumberField(body, "minOutputChars"),
    maxDialogueRounds: getOptionalNumberField(body, "maxDialogueRounds"),
    overwrite: getBooleanField(body, "overwrite"),
  };
}

function mapTaskRunApiInput(body: JsonObject): TaskRunRequest {
  return {
    taskId: getStringField(body, "taskId"),
    ...(getOptionalStringField(body, "reason")
      ? { reason: getOptionalStringField(body, "reason") }
      : {}),
  };
}

function mapTaskUpdateApiInput(body: JsonObject): TaskUpdateRequest {
  return {
    taskId: getStringField(body, "taskId"),
    ...(getOptionalStringField(body, "title")
      ? { title: getOptionalStringField(body, "title") }
      : {}),
    ...(getOptionalStringField(body, "description")
      ? { description: getOptionalStringField(body, "description") }
      : {}),
    ...(getOptionalStringField(body, "cron")
      ? { cron: getOptionalStringField(body, "cron") }
      : {}),
    ...(getOptionalStringField(body, "contextId")
      ? { contextId: getOptionalStringField(body, "contextId") }
      : {}),
    ...(getOptionalTaskKindField(body, "kind")
      ? { kind: getOptionalTaskKindField(body, "kind") }
      : {}),
    ...(getOptionalStringField(body, "time")
      ? { time: getOptionalStringField(body, "time") }
      : {}),
    ...(getBooleanField(body, "clearTime") ? { clearTime: true } : {}),
    ...(getOptionalTaskStatusField(body, "status")
      ? { status: getOptionalTaskStatusField(body, "status") }
      : {}),
    ...(getOptionalStringField(body, "timezone")
      ? { timezone: getOptionalStringField(body, "timezone") }
      : {}),
    ...(getBooleanField(body, "clearTimezone") ? { clearTimezone: true } : {}),
    ...(getOptionalStringArrayField(body, "requiredArtifacts")
      ? {
          requiredArtifacts: getOptionalStringArrayField(
            body,
            "requiredArtifacts",
          ),
        }
      : {}),
    ...(getBooleanField(body, "clearRequiredArtifacts")
      ? { clearRequiredArtifacts: true }
      : {}),
    ...(typeof getOptionalNumberField(body, "minOutputChars") === "number"
      ? { minOutputChars: getOptionalNumberField(body, "minOutputChars") }
      : {}),
    ...(getBooleanField(body, "clearMinOutputChars")
      ? { clearMinOutputChars: true }
      : {}),
    ...(typeof getOptionalNumberField(body, "maxDialogueRounds") === "number"
      ? {
          maxDialogueRounds: getOptionalNumberField(body, "maxDialogueRounds"),
        }
      : {}),
    ...(getBooleanField(body, "clearMaxDialogueRounds")
      ? { clearMaxDialogueRounds: true }
      : {}),
    ...(getOptionalStringField(body, "body")
      ? { body: getOptionalStringField(body, "body") }
      : {}),
    ...(getBooleanField(body, "clearBody") ? { clearBody: true } : {}),
  };
}

function mapTaskStatusApiInput(body: JsonObject): TaskSetStatusRequest {
  const status = getOptionalTaskStatusField(body, "status");
  if (!status) {
    throw new Error("Missing or invalid status");
  }
  return {
    taskId: getStringField(body, "taskId"),
    status,
  };
}

function mapTaskDeleteApiInput(body: JsonObject): TaskDeleteRequest {
  const taskId = getStringField(body, "taskId");
  if (!String(taskId || "").trim()) {
    throw new Error("Missing taskId");
  }
  return { taskId };
}

export const taskService: Service = {
  name: "task",
  system: () => TASK_SERVICE_PROMPT,
  actions: {
    list: {
      command: {
        description: "列出任务",
        configure(command: Command) {
          command.option(
            "--status <status>",
            "按状态过滤（enabled|paused|disabled）",
          );
        },
        mapInput({ opts }) {
          return mapTaskListCommandInput(opts);
        },
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapTaskListApiInput({
            status: c.req.query("status"),
          });
        },
      },
      async execute(params) {
        const payload = params.payload as TaskListPayload;
        const result = await listTaskDefinitions({
          projectRoot: params.context.rootPath,
          ...(payload.status ? { status: payload.status } : {}),
        });
        return {
          success: true,
          data: result,
        };
      },
    },
    create: {
      command: {
        description: "创建任务定义",
        configure(command: Command) {
          command
            .requiredOption("--title <title>", "任务标题")
            .requiredOption("--description <description>", "任务描述")
            .option("--task-id <taskId>", "任务 ID（不传则自动生成）")
            .option("--cron <cron>", "cron 表达式（默认 @manual）", "@manual")
            .option("--kind <kind>", "执行类型（agent|script）", "agent")
            .option(
              "--time <time>",
              "单次计划时间（ISO8601，例如 2026-03-05T01:00:00Z）",
            )
            .option(
              "--context-id <contextId>",
              "通知目标 contextId（不传尝试使用 SMA_CTX_CONTEXT_ID）",
            )
            .option(
              "--status <status>",
              "状态（enabled|paused|disabled）",
              "paused",
            )
            .option("--timezone <timezone>", "IANA 时区")
            .option(
              "--required-artifact <path>",
              "要求 run 目录必须产出的相对路径文件（可重复）",
              collectStringOption,
              [],
            )
            .option(
              "--min-output-chars <n>",
              "最小输出字符数（默认 1）",
              parseNonNegativeIntOption,
            )
            .option(
              "--max-dialogue-rounds <n>",
              "执行 agent 与模拟用户 agent 最大对话轮数（默认 3）",
              parsePositiveIntOption,
            )
            .option("--body <body>", "任务正文")
            .option("--overwrite", "覆盖已有 task.md", false);
        },
        mapInput({ opts }) {
          return mapTaskCreateCommandInput(opts);
        },
      },
      api: {
        method: "POST",
        async mapInput(c) {
          const body = parseJsonBodyObject(await c.req.json());
          return mapTaskCreateApiInput(body);
        },
      },
      async execute(params) {
        const payload = params.payload as TaskCreateRequest;
        const result = await createTaskDefinition({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task create failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    run: {
      command: {
        description: "手动运行任务",
        configure(command: Command) {
          command
            .argument("<taskId>")
            .option("--reason <reason>", "手动运行原因");
        },
        mapInput({ args, opts }): TaskRunRequest {
          const taskId = String(args[0] || "").trim();
          if (!taskId) throw new Error("Missing taskId");
          const reason = getStringOpt(opts, "reason");
          return {
            taskId,
            ...(reason ? { reason } : {}),
          };
        },
      },
      api: {
        method: "POST",
        async mapInput(c) {
          const body = parseJsonBodyObject(await c.req.json());
          return mapTaskRunApiInput(body);
        },
      },
      async execute(params) {
        const payload = params.payload as TaskRunRequest;
        const result = await runTaskDefinition({
          context: params.context,
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task run failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    delete: {
      command: {
        description: "删除任务定义与历史运行目录",
        configure(command: Command) {
          command.argument("<taskId>");
        },
        mapInput({ args }) {
          return mapTaskDeleteCommandInput(String(args[0] || ""));
        },
      },
      api: {
        method: "DELETE",
        async mapInput(c) {
          const body = parseJsonBodyObject(await c.req.json());
          return mapTaskDeleteApiInput(body);
        },
      },
      async execute(params) {
        const payload = params.payload as TaskDeleteRequest;
        const result = await deleteTaskDefinition({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task delete failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    update: {
      command: {
        description: "更新任务定义",
        configure(command: Command) {
          command
            .argument("<taskId>")
            .option("--title <title>", "任务标题")
            .option("--description <description>", "任务描述")
            .option("--cron <cron>", "cron 表达式")
            .option("--kind <kind>", "执行类型（agent|script）")
            .option("--time <time>", "单次计划时间（ISO8601）")
            .option("--clear-time", "清空 time", false)
            .option("--context-id <contextId>", "通知目标 contextId")
            .option("--status <status>", "状态（enabled|paused|disabled）")
            .option("--timezone <timezone>", "IANA 时区")
            .option("--clear-timezone", "清空 timezone", false)
            .option(
              "--required-artifact <path>",
              "设置 requiredArtifacts（可重复；与 --clear-required-artifacts 互斥）",
              collectStringOption,
            )
            .option(
              "--clear-required-artifacts",
              "清空 requiredArtifacts",
              false,
            )
            .option(
              "--min-output-chars <n>",
              "设置最小输出字符数",
              parseNonNegativeIntOption,
            )
            .option("--clear-min-output-chars", "清空 minOutputChars", false)
            .option(
              "--max-dialogue-rounds <n>",
              "设置最大对话轮数",
              parsePositiveIntOption,
            )
            .option(
              "--clear-max-dialogue-rounds",
              "清空 maxDialogueRounds",
              false,
            )
            .option("--body <body>", "设置任务正文")
            .option("--clear-body", "清空任务正文", false);
        },
        mapInput({ args, opts }) {
          const taskId = String(args[0] || "").trim();
          if (!taskId) throw new Error("Missing taskId");
          return mapTaskUpdateCommandInput({
            taskId,
            opts,
          });
        },
      },
      api: {
        method: "PUT",
        async mapInput(c) {
          const body = parseJsonBodyObject(await c.req.json());
          return mapTaskUpdateApiInput(body);
        },
      },
      async execute(params) {
        const payload = params.payload as TaskUpdateRequest;
        const result = await updateTaskDefinition({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task update failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    status: {
      command: {
        description: "设置任务状态（enabled|paused|disabled）",
        configure(command: Command) {
          command.argument("<taskId>").argument("<status>");
        },
        mapInput({ args }) {
          const taskId = String(args[0] || "").trim();
          const status = readTaskStatusOrThrow(String(args[1] || "").trim());
          if (!taskId) throw new Error("Missing taskId");
          if (!status) throw new Error("Missing or invalid status");
          return mapTaskSetStatusCommandInput({
            taskId,
            status,
          });
        },
      },
      api: {
        method: "PUT",
        async mapInput(c) {
          const body = parseJsonBodyObject(await c.req.json());
          return mapTaskStatusApiInput(body);
        },
      },
      async execute(params) {
        const payload = params.payload as TaskSetStatusRequest;
        const result = await setTaskStatus({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task status update failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    enable: {
      command: {
        description: "启用任务（status=enabled）",
        configure(command: Command) {
          command.argument("<taskId>");
        },
        mapInput({ args }) {
          const taskId = String(args[0] || "").trim();
          if (!taskId) throw new Error("Missing taskId");
          return mapTaskSetStatusCommandInput({
            taskId,
            status: "enabled",
          });
        },
      },
      async execute(params) {
        const payload = params.payload as TaskSetStatusRequest;
        const result = await setTaskStatus({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task enable failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    disable: {
      command: {
        description: "禁用任务（status=disabled）",
        configure(command: Command) {
          command.argument("<taskId>");
        },
        mapInput({ args }) {
          const taskId = String(args[0] || "").trim();
          if (!taskId) throw new Error("Missing taskId");
          return mapTaskSetStatusCommandInput({
            taskId,
            status: "disabled",
          });
        },
      },
      async execute(params) {
        const payload = params.payload as TaskSetStatusRequest;
        const result = await setTaskStatus({
          projectRoot: params.context.rootPath,
          request: payload,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "task disable failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
  },
  lifecycle: {
    async start(context) {
      const result = await startTaskCronRuntime(context);
      if (!result) return;
      context.logger.info(
        formatTaskLogMessage(
          `Task cron trigger started (tasks=${result.tasksFound}, jobs=${result.jobsScheduled})`,
        ),
      );
    },
    async stop(context) {
      const stopped = await stopTaskCronRuntime();
      if (!stopped) return;
      context.logger.info(formatTaskLogMessage("Task cron trigger stopped"));
    },
    async command({ context, command }) {
      if (command !== "reschedule" && command !== "reload") {
        return {
          success: false,
          message: `Unknown task command: ${command}`,
        };
      }

      const result = await restartTaskCronRuntime(context);
      context.logger.info(
        formatTaskLogMessage(
          `Task cron trigger reloaded (tasks=${result.tasksFound}, jobs=${result.jobsScheduled})`,
        ),
      );
      return {
        success: true,
        message: "task scheduler reloaded",
      };
    },
  },
};
