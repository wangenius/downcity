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
import { resolveContextId } from "@agent/context/manager/ContextId.js";
import type { Service } from "@agent/service/ServiceManager.js";
import type { ServiceRuntime } from "@agent/service/ServiceRuntime.js";
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
      "Missing contextId. Provide --context-id or ensure DC_CTX_CONTEXT_ID is available.",
    );
  }
  return contextId;
}

/**
 * 任务定义变更后重载 scheduler。
 *
 * 关键点（中文）
 * - 解决“create/update 后还沿用旧注册表”的时序问题。
 * - 重载失败不阻断主操作（任务定义已经写入成功），仅记录 warning 供排查。
 */
async function reloadTaskSchedulerAfterMutation(params: {
  context: ServiceRuntime;
  action: "create" | "update" | "delete" | "status";
  title: string;
}): Promise<{
  reloaded: boolean;
  tasksFound?: number;
  jobsScheduled?: number;
  error?: string;
}> {
  try {
    const result = await restartTaskCronRuntime(params.context);
    params.context.logger.info(
      formatTaskLogMessage("Task scheduler reloaded after mutation"),
      {
        action: params.action,
        title: params.title,
        tasksFound: result.tasksFound,
        jobsScheduled: result.jobsScheduled,
      },
    );
    return {
      reloaded: true,
      tasksFound: result.tasksFound,
      jobsScheduled: result.jobsScheduled,
    };
  } catch (error) {
    const reason = String(error);
    params.context.logger.warn(
      formatTaskLogMessage("Task scheduler reload failed after mutation"),
      {
        action: params.action,
        title: params.title,
        error: reason,
      },
    );
    return {
      reloaded: false,
      error: reason,
    };
  }
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
  const activate = getBooleanOpt(opts, "activate") === true;
  if (activate && status && status !== "enabled") {
    throw new Error("`--activate` conflicts with `--status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title,
    when: String(getStringOpt(opts, "when") || "@manual").trim() || "@manual",
    description,
    contextId,
    ...(kind ? { kind } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    overwrite: getBooleanOpt(opts, "overwrite") === true,
  };
}

function mapTaskUpdateCommandInput(params: {
  title: string;
  opts: Record<string, JsonValue>;
}): TaskUpdateRequest {
  const opts = params.opts;
  const kind = readTaskKindOrThrow(getStringOpt(opts, "kind"));
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  const activate = getBooleanOpt(opts, "activate") === true;

  // 关键点（中文）：set 与 clear 选项互斥，提前在命令入口做校验。
  const conflicts: string[] = [];
  if (
    typeof getStringOpt(opts, "body") === "string" &&
    getBooleanOpt(opts, "clearBody")
  ) {
    conflicts.push("`--body` conflicts with `--clear-body`");
  }
  if (
    typeof getStringOpt(opts, "when") === "string" &&
    getBooleanOpt(opts, "clearWhen")
  ) {
    conflicts.push("`--when` conflicts with `--clear-when`");
  }
  if (activate && status && status !== "enabled") {
    conflicts.push("`--activate` conflicts with `--status` unless status=enabled");
  }
  if (conflicts.length > 0) {
    throw new Error(conflicts.join("; "));
  }
  const resolvedStatus = activate ? "enabled" : status;

  const hasUpdate =
    typeof getStringOpt(opts, "title") === "string" ||
    typeof getStringOpt(opts, "when") === "string" ||
    typeof getStringOpt(opts, "description") === "string" ||
    typeof getStringOpt(opts, "contextId") === "string" ||
    typeof kind === "string" ||
    getBooleanOpt(opts, "clearWhen") === true ||
    typeof resolvedStatus === "string" ||
    typeof getStringOpt(opts, "body") === "string" ||
    getBooleanOpt(opts, "clearBody") === true;

  if (!hasUpdate) {
    throw new Error("No update fields provided");
  }

  return {
    title: String(params.title || "").trim(),
    ...(typeof getStringOpt(opts, "title") === "string"
      ? { titleNext: getStringOpt(opts, "title") }
      : {}),
    ...(typeof getStringOpt(opts, "when") === "string"
      ? { when: getStringOpt(opts, "when") }
      : {}),
    ...(typeof getStringOpt(opts, "description") === "string"
      ? { description: getStringOpt(opts, "description") }
      : {}),
    ...(typeof getStringOpt(opts, "contextId") === "string"
      ? { contextId: getStringOpt(opts, "contextId") }
      : {}),
    ...(typeof kind === "string" ? { kind } : {}),
    ...(getBooleanOpt(opts, "clearWhen") ? { clearWhen: true } : {}),
    ...(typeof resolvedStatus === "string" ? { status: resolvedStatus } : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    ...(getBooleanOpt(opts, "clearBody") ? { clearBody: true } : {}),
  };
}

function mapTaskSetStatusCommandInput(params: {
  title: string;
  status: ShipTaskStatus;
}): TaskSetStatusRequest {
  return {
    title: String(params.title || "").trim(),
    status: params.status,
  };
}

function mapTaskDeleteCommandInput(titleInput: string): TaskDeleteRequest {
  const title = String(titleInput || "").trim();
  if (!title) throw new Error("Missing title");
  return { title };
}

function mapTaskListApiInput(query: { status?: string }): TaskListPayload {
  const status = readTaskStatusOrThrow(
    typeof query.status === "string" ? query.status.trim() : undefined,
  );
  return status ? { status } : {};
}

function mapTaskCreateApiInput(body: JsonObject): TaskCreateRequest {
  const status = getOptionalTaskStatusField(body, "status");
  const activate = getBooleanField(body, "activate");
  if (activate && status && status !== "enabled") {
    throw new Error("`activate` conflicts with `status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title: getStringField(body, "title"),
    when: getStringField(body, "when"),
    description: getStringField(body, "description"),
    contextId: getStringField(body, "contextId"),
    kind: getOptionalTaskKindField(body, "kind"),
    status: resolvedStatus,
    body: getOptionalStringField(body, "body"),
    overwrite: getBooleanField(body, "overwrite"),
  };
}

function mapTaskRunApiInput(body: JsonObject): TaskRunRequest {
  return {
    title: getStringField(body, "title"),
    ...(getOptionalStringField(body, "reason")
      ? { reason: getOptionalStringField(body, "reason") }
      : {}),
  };
}

function mapTaskUpdateApiInput(body: JsonObject): TaskUpdateRequest {
  const status = getOptionalTaskStatusField(body, "status");
  const activate = getBooleanField(body, "activate");
  if (activate && status && status !== "enabled") {
    throw new Error("`activate` conflicts with `status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title: getStringField(body, "title"),
    ...(getOptionalStringField(body, "titleNext")
      ? { titleNext: getOptionalStringField(body, "titleNext") }
      : {}),
    ...(getOptionalStringField(body, "description")
      ? { description: getOptionalStringField(body, "description") }
      : {}),
    ...(getOptionalStringField(body, "when")
      ? { when: getOptionalStringField(body, "when") }
      : {}),
    ...(getOptionalStringField(body, "contextId")
      ? { contextId: getOptionalStringField(body, "contextId") }
      : {}),
    ...(getOptionalTaskKindField(body, "kind")
      ? { kind: getOptionalTaskKindField(body, "kind") }
      : {}),
    ...(getBooleanField(body, "clearWhen") ? { clearWhen: true } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
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
    title: getStringField(body, "title"),
    status,
  };
}

function mapTaskDeleteApiInput(body: JsonObject): TaskDeleteRequest {
  const title = getStringField(body, "title");
  if (!String(title || "").trim()) {
    throw new Error("Missing title");
  }
  return { title };
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
            .requiredOption("--title <title>", "任务名称（唯一语义标识）")
            .requiredOption("--description <description>", "任务描述")
            .option("--when <when>", "触发条件（@manual | cron | time:ISO8601）", "@manual")
            .option("--kind <kind>", "执行类型（agent|script）", "agent")
            .option(
              "--context-id <contextId>",
              "任务执行 contextId（不传尝试使用 DC_CTX_CONTEXT_ID）",
            )
            .option(
              "--status <status>",
              "状态（enabled|paused|disabled，默认 paused）",
            )
            .option(
              "--activate",
              "创建后立即启用（等同 --status enabled）",
              false,
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "create",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
        };
      },
    },
    run: {
      command: {
        description: "手动运行任务",
        configure(command: Command) {
          command
            .argument("<title>")
            .option("--reason <reason>", "手动运行原因");
        },
        mapInput({ args, opts }): TaskRunRequest {
          const title = String(args[0] || "").trim();
          if (!title) throw new Error("Missing title");
          const reason = getStringOpt(opts, "reason");
          return {
            title,
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
          command.argument("<title>");
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "delete",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
        };
      },
    },
    update: {
      command: {
        description: "更新任务定义",
        configure(command: Command) {
          command
            .argument("<title>")
            .option("--title <title>", "任务名称（保持同一语义）")
            .option("--description <description>", "任务描述")
            .option("--when <when>", "触发条件（@manual | cron | time:ISO8601）")
            .option("--kind <kind>", "执行类型（agent|script）")
            .option("--clear-when", "清空 when（回退为 @manual）", false)
            .option("--context-id <contextId>", "任务执行 contextId")
            .option("--status <status>", "状态（enabled|paused|disabled）")
            .option(
              "--activate",
              "更新后立即启用（等同 --status enabled）",
              false,
            )
            .option("--body <body>", "设置任务正文")
            .option("--clear-body", "清空任务正文", false);
        },
        mapInput({ args, opts }) {
          const title = String(args[0] || "").trim();
          if (!title) throw new Error("Missing title");
          return mapTaskUpdateCommandInput({
            title,
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "update",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
        };
      },
    },
    status: {
      command: {
        description: "设置任务状态（enabled|paused|disabled）",
        configure(command: Command) {
          command.argument("<title>").argument("<status>");
        },
        mapInput({ args }) {
          const title = String(args[0] || "").trim();
          const status = readTaskStatusOrThrow(String(args[1] || "").trim());
          if (!title) throw new Error("Missing title");
          if (!status) throw new Error("Missing or invalid status");
          return mapTaskSetStatusCommandInput({
            title,
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "status",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
        };
      },
    },
    enable: {
      command: {
        description: "启用任务（status=enabled）",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput({ args }) {
          const title = String(args[0] || "").trim();
          if (!title) throw new Error("Missing title");
          return mapTaskSetStatusCommandInput({
            title,
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "status",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
        };
      },
    },
    disable: {
      command: {
        description: "禁用任务（status=disabled）",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput({ args }) {
          const title = String(args[0] || "").trim();
          if (!title) throw new Error("Missing title");
          return mapTaskSetStatusCommandInput({
            title,
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
        const scheduler = await reloadTaskSchedulerAfterMutation({
          context: params.context,
          action: "status",
          title: String(result.title || payload.title || "").trim() || "unknown",
        });
        return {
          success: true,
          data: {
            ...result,
            scheduler,
          },
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
