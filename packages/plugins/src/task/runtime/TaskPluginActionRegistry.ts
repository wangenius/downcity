/**
 * TaskPluginActions：task plugin runtime 的 action 注册表模块。
 *
 * 关键点（中文）
 * - 这里专门负责把 task 的 CLI/execute 定义装配成 `PluginActions`。
 * - task plugin runtime 本体只保留实例状态与 lifecycle，不再承载大段 action 声明。
 */

import type { Command } from "commander";
import type { PluginActions } from "@downcity/agent/internal/plugin/types/Plugin.js";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { z } from "zod";
import type { TaskListActionPayload } from "@/task/types/TaskPluginTypes.js";
import type {
  TaskCreateRequest,
  TaskDeleteRequest,
  TaskRunRequest,
  TaskSetStatusRequest,
  TaskUpdateRequest,
} from "@/task/types/TaskCommand.js";
import {
  executeTaskCreateAction,
  executeTaskDeleteAction,
  executeTaskListAction,
  executeTaskRunAction,
  executeTaskStatusAction,
  executeTaskUpdateAction,
  type TaskSchedulerReloadPort,
} from "./TaskActionExecution.js";
import {
  mapTaskCreateCommandPayload,
  mapTaskDeleteCommandPayload,
  mapTaskDisableCommandPayload,
  mapTaskEnableCommandPayload,
  mapTaskListCommandPayload,
  mapTaskRunCommandPayload,
  mapTaskStatusCommandPayload,
  mapTaskUpdateCommandPayload,
} from "./TaskActionInput.js";

const TASK_STATUS_SCHEMA = z.enum(["enabled", "paused", "disabled"]);
const TASK_KIND_SCHEMA = z.enum(["agent", "script"]);

const TASK_LIST_SCHEMA = z.object({
  status: TASK_STATUS_SCHEMA.optional(),
});

const TASK_CREATE_SCHEMA = z.object({
  title: z.string(),
  when: z.string(),
  description: z.string(),
  sessionId: z.string(),
  kind: TASK_KIND_SCHEMA.optional(),
  review: z.boolean().optional(),
  status: TASK_STATUS_SCHEMA.optional(),
  body: z.string().optional(),
  overwrite: z.boolean().optional(),
});

const TASK_UPDATE_SCHEMA = z.object({
  title: z.string(),
  titleNext: z.string().optional(),
  when: z.string().optional(),
  clearWhen: z.boolean().optional(),
  description: z.string().optional(),
  sessionId: z.string().optional(),
  kind: TASK_KIND_SCHEMA.optional(),
  review: z.boolean().optional(),
  status: TASK_STATUS_SCHEMA.optional(),
  body: z.string().optional(),
  clearBody: z.boolean().optional(),
});

const TASK_RUN_SCHEMA = z.object({
  title: z.string(),
  reason: z.string().optional(),
});

const TASK_DELETE_SCHEMA = z.object({
  title: z.string(),
});

const TASK_STATUS_REQ_SCHEMA = z.object({
  title: z.string(),
  status: TASK_STATUS_SCHEMA,
});

/**
 * 创建 task plugin runtime 的 action 定义表。
 */
export function createTaskPluginActions(params: {
  reloadSchedulerAfterMutation: TaskSchedulerReloadPort;
}): PluginActions {
  return {
    list: createAction({
      description: "列出任务定义；可按状态过滤。",
      input_schema: {
        zod: TASK_LIST_SCHEMA,
        json_schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["enabled", "paused", "disabled"],
              description: "按任务状态过滤",
            },
          },
        },
      },
      examples: [
        { title: "全部任务", payload: {} },
        { title: "只看已启用", payload: { status: "enabled" } },
      ],
      command: {
        description: "列出任务",
        configure(command: Command) {
          command.option(
            "--status <status>",
            "按状态过滤（enabled|paused|disabled）",
          );
        },
        mapInput: mapTaskListCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskListAction({
          context: actionParams.context,
          payload: actionParams.input as TaskListActionPayload,
        });
      },
    }),
    create: createAction({
      description: "创建任务定义。",
      input_schema: {
        zod: TASK_CREATE_SCHEMA,
        json_schema: {
          type: "object",
          required: ["title", "when", "description", "sessionId"],
          properties: {
            title: { type: "string", description: "任务名称（唯一语义标识）" },
            when: { type: "string", description: "触发条件（@manual | cron | time:ISO8601）" },
            description: { type: "string", description: "任务描述" },
            sessionId: { type: "string", description: "任务执行 sessionId" },
            kind: { type: "string", enum: ["agent", "script"], description: "执行类型" },
            review: { type: "boolean", description: "是否启用 review 多轮复核" },
            status: { type: "string", enum: ["enabled", "paused", "disabled"], description: "任务状态" },
            body: { type: "string", description: "任务正文" },
            overwrite: { type: "boolean", description: "是否覆盖已有 task.md" },
          },
        },
      },
      examples: [
        {
          title: "创建一个手动任务",
          payload: {
            title: "daily-report",
            when: "@manual",
            description: "每天生成报告",
            sessionId: "session-1",
            status: "enabled",
          },
        },
      ],
      command: {
        description: "创建任务定义",
        configure(command: Command) {
          command
            .requiredOption("--title <title>", "任务名称（唯一语义标识）")
            .requiredOption("--description <description>", "任务描述")
            .option("--when <when>", "触发条件（@manual | cron | time:ISO8601）", "@manual")
            .option("--kind <kind>", "执行类型（agent|script）", "agent")
            .option("--review <review>", "是否启用 review 多轮复核（true|false）")
            .option(
              "--session-id <sessionId>",
              "任务执行 sessionId（不传尝试使用 DC_SESSION_ID）",
            )
            .option(
              "--status <status>",
              "状态（enabled|paused|disabled，默认 enabled）",
            )
            .option(
              "--activate",
              "创建后立即启用（等同 --status enabled）",
              false,
            )
            .option("--body <body>", "任务正文")
            .option("--overwrite", "覆盖已有 task.md", false);
        },
        mapInput: mapTaskCreateCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskCreateAction({
          context: actionParams.context,
          payload: actionParams.input as TaskCreateRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
    run: createAction({
      description: "手动运行任务。",
      input_schema: {
        zod: TASK_RUN_SCHEMA,
        json_schema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", description: "任务名称" },
            reason: { type: "string", description: "手动运行原因" },
          },
        },
      },
      examples: [{ title: "手动运行", payload: { title: "daily-report" } }],
      command: {
        description: "手动运行任务",
        configure(command: Command) {
          command
            .argument("<title>")
            .option("--reason <reason>", "手动运行原因");
        },
        mapInput: mapTaskRunCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskRunAction({
          context: actionParams.context,
          payload: actionParams.input as TaskRunRequest,
        });
      },
    }),
    delete: createAction({
      description: "删除任务定义与历史运行目录。",
      input_schema: {
        zod: TASK_DELETE_SCHEMA,
        json_schema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", description: "任务名称" },
          },
        },
      },
      examples: [{ title: "删除任务", payload: { title: "daily-report" } }],
      command: {
        description: "删除任务定义与历史运行目录",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput: mapTaskDeleteCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskDeleteAction({
          context: actionParams.context,
          payload: actionParams.input as TaskDeleteRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
    update: createAction({
      description: "更新任务定义。",
      input_schema: {
        zod: TASK_UPDATE_SCHEMA,
        json_schema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", description: "当前任务名称" },
            titleNext: { type: "string", description: "新任务名称" },
            when: { type: "string", description: "新触发条件" },
            clearWhen: { type: "boolean", description: "是否清空触发条件" },
            description: { type: "string", description: "新描述" },
            sessionId: { type: "string", description: "新 sessionId" },
            kind: { type: "string", enum: ["agent", "script"] },
            review: { type: "boolean" },
            status: { type: "string", enum: ["enabled", "paused", "disabled"] },
            body: { type: "string", description: "新正文" },
            clearBody: { type: "boolean", description: "是否清空正文" },
          },
        },
      },
      examples: [
        {
          title: "更新触发器",
          payload: { title: "daily-report", when: "cron:0 9 * * *" },
        },
      ],
      command: {
        description: "更新任务定义",
        configure(command: Command) {
          command
            .argument("<title>")
            .option("--title <title>", "任务名称（保持同一语义）")
            .option("--description <description>", "任务描述")
            .option("--when <when>", "触发条件（@manual | cron | time:ISO8601）")
            .option("--kind <kind>", "执行类型（agent|script）")
            .option("--review <review>", "是否启用 review 多轮复核（true|false）")
            .option("--clear-when", "清空 when（回退为 @manual）", false)
            .option("--session-id <sessionId>", "任务执行 sessionId")
            .option("--status <status>", "状态（enabled|paused|disabled）")
            .option(
              "--activate",
              "更新后立即启用（等同 --status enabled）",
              false,
            )
            .option("--body <body>", "设置任务正文")
            .option("--clear-body", "清空任务正文", false);
        },
        mapInput: mapTaskUpdateCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskUpdateAction({
          context: actionParams.context,
          payload: actionParams.input as TaskUpdateRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
    status: createAction({
      description: "设置任务状态（enabled|paused|disabled）。",
      input_schema: {
        zod: TASK_STATUS_REQ_SCHEMA,
        json_schema: {
          type: "object",
          required: ["title", "status"],
          properties: {
            title: { type: "string", description: "任务名称" },
            status: { type: "string", enum: ["enabled", "paused", "disabled"] },
          },
        },
      },
      examples: [
        { title: "暂停任务", payload: { title: "daily-report", status: "paused" } },
      ],
      command: {
        description: "设置任务状态（enabled|paused|disabled）",
        configure(command: Command) {
          command.argument("<title>").argument("<status>");
        },
        mapInput: mapTaskStatusCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskStatusAction({
          context: actionParams.context,
          payload: actionParams.input as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
    enable: createAction({
      description: "启用任务（status=enabled）。",
      input_schema: {
        zod: z.object({ title: z.string() }),
        json_schema: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", description: "任务名称" } },
        },
      },
      examples: [{ title: "启用", payload: { title: "daily-report" } }],
      command: {
        description: "启用任务（status=enabled）",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput: mapTaskEnableCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskStatusAction({
          context: actionParams.context,
          payload: actionParams.input as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
    disable: createAction({
      description: "禁用任务（status=disabled）。",
      input_schema: {
        zod: z.object({ title: z.string() }),
        json_schema: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", description: "任务名称" } },
        },
      },
      examples: [{ title: "禁用", payload: { title: "daily-report" } }],
      command: {
        description: "禁用任务（status=disabled）",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput: mapTaskDisableCommandPayload,
      },
      execute: async (actionParams) => {
        return executeTaskStatusAction({
          context: actionParams.context,
          payload: actionParams.input as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    }),
  };
}
