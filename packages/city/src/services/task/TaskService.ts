/**
 * TaskService：task service 的类实例实现。
 *
 * 关键点（中文）
 * - task 的长期运行态（cron engine）归属于 TaskService 实例。
 * - task 的 prompt、action input、action execution 都已拆到独立模块。
 * - 当前文件只保留实例骨架与 lifecycle，不再依赖旧的模块级 `taskService` 单例。
 */

import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import { BaseService } from "@services/BaseService.js";
import type { ServiceActions } from "@/shared/types/Service.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type {
  TaskCronRegisterResult,
  TaskSchedulerReloadResult,
} from "@/shared/types/TaskService.js";
import { TaskCronTriggerEngine } from "@services/task/runtime/CronTrigger.js";
import { registerTaskCronJobs } from "@services/task/Scheduler.js";
import {
  createTaskServiceActions,
} from "@services/task/runtime/TaskServiceActions.js";
import {
  reloadTaskSchedulerAfterMutation,
} from "@services/task/runtime/TaskActionExecution.js";
import { TASK_SERVICE_PROMPT } from "@services/task/runtime/TaskServiceSystem.js";

const TASK_LOG_PREFIX = "[TASK]";

function formatTaskLogMessage(message: string): string {
  return `${TASK_LOG_PREFIX} ${message}`;
}

/**
 * task service 类实现。
 */
export class TaskService extends BaseService {
  /**
   * 当前 service 名称。
   */
  readonly name = "task";

  /**
   * task service 的 system 文本提供器。
   */
  readonly system = (): string => TASK_SERVICE_PROMPT;

  /**
   * task service 的 action 定义表。
   */
  readonly actions: ServiceActions;

  /**
   * 当前实例持有的 cron engine。
   *
   * 关键点（中文）
   * - 这是 per-service-instance 的长期运行态。
   * - 不再复用 module-global 单例。
   */
  public cronEngine: TaskCronTriggerEngine | null = null;

  constructor(agent: AgentRuntime | null) {
    super(agent);

    this.actions = createTaskServiceActions({
      reloadSchedulerAfterMutation: async (params) =>
        this.reloadSchedulerAfterMutation(params),
    });

    this.lifecycle = {
      start: async (context) => {
        const result = await this.startCronRuntime(context);
        if (!result) return;
        context.logger.info(
          formatTaskLogMessage(
            `Task cron trigger started (tasks=${result.tasksFound}, jobs=${result.jobsScheduled})`,
          ),
        );
      },
      stop: async (context) => {
        const stopped = await this.stopCronRuntime();
        if (!stopped) return;
        context.logger.info(formatTaskLogMessage("Task cron trigger stopped"));
      },
      command: async ({ context, command }) => {
        if (command !== "reschedule" && command !== "reload") {
          return {
            success: false,
            message: `Unknown task command: ${command}`,
          };
        }

        const result = await this.restartCronRuntime(context);
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
    };
  }

  /**
   * 启动当前实例的 cron runtime。
   */
  async startCronRuntime(
    context: AgentContext,
  ): Promise<TaskCronRegisterResult | null> {
    if (this.cronEngine) return null;

    const engine = new TaskCronTriggerEngine();
    const registerResult = await registerTaskCronJobs({
      context,
      engine,
    });
    await engine.start();
    this.cronEngine = engine;
    return registerResult;
  }

  /**
   * 停止当前实例的 cron runtime。
   */
  async stopCronRuntime(): Promise<boolean> {
    if (!this.cronEngine) return false;
    const previous = this.cronEngine;
    this.cronEngine = null;
    await previous.stop();
    return true;
  }

  /**
   * 重启当前实例的 cron runtime。
   */
  async restartCronRuntime(
    context: AgentContext,
  ): Promise<TaskCronRegisterResult> {
    await this.stopCronRuntime();
    const started = await this.startCronRuntime(context);
    return (
      started || {
        tasksFound: 0,
        jobsScheduled: 0,
      }
    );
  }

  /**
   * 任务定义变更后重载 scheduler。
   */
  private async reloadSchedulerAfterMutation(params: {
    context: AgentContext;
    action: "create" | "update" | "delete" | "status";
    title: string;
  }): Promise<TaskSchedulerReloadResult> {
    return await reloadTaskSchedulerAfterMutation({
      context: params.context,
      action: params.action,
      title: params.title,
      reloadScheduler: async (context) => this.restartCronRuntime(context),
    });
  }
}
