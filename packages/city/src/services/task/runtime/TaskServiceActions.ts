/**
 * TaskServiceActions：task service 的 action 注册表模块。
 *
 * 关键点（中文）
 * - 这里专门负责把 task 的 CLI/API/execute 定义装配成 `ServiceActions`。
 * - TaskService 本体只保留实例状态与 lifecycle，不再承载大段 action 声明。
 */

import type { Command } from "commander";
import type { ServiceActions } from "@/shared/types/Service.js";
import type { TaskListActionPayload } from "@/shared/types/TaskService.js";
import type {
  TaskCreateRequest,
  TaskDeleteRequest,
  TaskRunRequest,
  TaskSetStatusRequest,
  TaskUpdateRequest,
} from "@services/task/types/TaskCommand.js";
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
  mapTaskCreateApiPayload,
  mapTaskCreateCommandPayload,
  mapTaskDeleteApiPayload,
  mapTaskDeleteCommandPayload,
  mapTaskDisableCommandPayload,
  mapTaskEnableCommandPayload,
  mapTaskListApiPayload,
  mapTaskListCommandPayload,
  mapTaskRunApiPayload,
  mapTaskRunCommandPayload,
  mapTaskStatusApiPayload,
  mapTaskStatusCommandPayload,
  mapTaskUpdateApiPayload,
  mapTaskUpdateCommandPayload,
} from "./TaskActionInput.js";

/**
 * 创建 task service 的 action 定义表。
 */
export function createTaskServiceActions(params: {
  reloadSchedulerAfterMutation: TaskSchedulerReloadPort;
}): ServiceActions {
  return {
    list: {
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
      api: {
        method: "GET",
        mapInput(c) {
          return mapTaskListApiPayload({
            status: c.req.query("status"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeTaskListAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskListActionPayload,
        });
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
      api: {
        method: "POST",
        mapInput: mapTaskCreateApiPayload,
      },
      execute: async (actionParams) => {
        return executeTaskCreateAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskCreateRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
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
        mapInput: mapTaskRunCommandPayload,
      },
      api: {
        method: "POST",
        mapInput: mapTaskRunApiPayload,
      },
      execute: async (actionParams) => {
        return executeTaskRunAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskRunRequest,
        });
      },
    },
    delete: {
      command: {
        description: "删除任务定义与历史运行目录",
        configure(command: Command) {
          command.argument("<title>");
        },
        mapInput: mapTaskDeleteCommandPayload,
      },
      api: {
        method: "DELETE",
        mapInput: mapTaskDeleteApiPayload,
      },
      execute: async (actionParams) => {
        return executeTaskDeleteAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskDeleteRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
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
      api: {
        method: "PUT",
        mapInput: mapTaskUpdateApiPayload,
      },
      execute: async (actionParams) => {
        return executeTaskUpdateAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskUpdateRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    },
    status: {
      command: {
        description: "设置任务状态（enabled|paused|disabled）",
        configure(command: Command) {
          command.argument("<title>").argument("<status>");
        },
        mapInput: mapTaskStatusCommandPayload,
      },
      api: {
        method: "PUT",
        mapInput: mapTaskStatusApiPayload,
      },
      execute: async (actionParams) => {
        return executeTaskStatusAction({
          context: actionParams.context,
          payload: actionParams.payload as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    },
    enable: {
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
          payload: actionParams.payload as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    },
    disable: {
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
          payload: actionParams.payload as TaskSetStatusRequest,
          reloadSchedulerAfterMutation: params.reloadSchedulerAfterMutation,
        });
      },
    },
  };
}
