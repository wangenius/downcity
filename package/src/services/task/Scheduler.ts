/**
 * Task cron job registration（集成层）。
 *
 * 关键点（中文）
 * - task 语义（status/cron/@manual/timezone/串行保护）放在 service。
 * - cron 调度执行器由 server 注入，service 不依赖具体实现。
 */

import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import { normalizeTaskCronExpression } from "./runtime/Model.js";
import { listTasks, readTask, writeTask } from "./runtime/Store.js";
import { runTaskNow } from "./runtime/Runner.js";
import { ServiceCronEngine } from "./types/Cron.js";

const TASK_LOG_PREFIX = "[TASK]";

function formatTaskLogMessage(message: string): string {
  return `${TASK_LOG_PREFIX} ${message}`;
}

function parsePlannedTimeMs(raw: string | undefined): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms) || Number.isNaN(ms)) return null;
  return ms;
}

export async function registerTaskCronJobs(params: {
  context: ServiceRuntime;
  engine: ServiceCronEngine;
}): Promise<{ tasksFound: number; jobsScheduled: number }> {
  const runtime = params.context;
  const logger = runtime.logger;
  const tasks = await listTasks(runtime.rootPath);

  const runningByTaskId = new Set<string>();
  let jobsScheduled = 0;

  for (const item of tasks) {
    if (String(item.status).toLowerCase() !== "enabled") continue;

    const expr = normalizeTaskCronExpression(item.cron);
    let timezone: string | undefined;
    let timeRaw: string | undefined;
    try {
      const task = await readTask({
        taskId: item.taskId,
        projectRoot: runtime.rootPath,
      });
      timezone = task.frontmatter.timezone;
      timeRaw = task.frontmatter.time;
    } catch {
      timezone = item.timezone;
      timeRaw = item.time;
    }

    if (expr && expr !== "@manual") {
      try {
        params.engine.register({
          id: `task:${item.taskId}`,
          expression: expr,
          ...(timezone ? { timezone } : {}),
          execute: async () => {
            const taskId = String(item.taskId || "").trim();
            if (!taskId) return;

            // 关键点（中文）：同一 taskId 串行；重叠触发时跳过，避免并发执行污染 run 目录。
            if (runningByTaskId.has(taskId)) {
              void logger.log("warn", formatTaskLogMessage("Task skipped (already running)"), {
                taskId,
                via: "cron",
              });
              return;
            }

            runningByTaskId.add(taskId);
            try {
              // 关键点（中文）：触发瞬间复查最新 task.md，避免 status/time/cron 变更后仍沿用旧注册状态。
              const latest = await readTask({
                taskId,
                projectRoot: runtime.rootPath,
              });
              if (String(latest.frontmatter.status).toLowerCase() !== "enabled") {
                return;
              }
              const latestExpr = normalizeTaskCronExpression(latest.frontmatter.cron);
              if (!latestExpr || latestExpr === "@manual") {
                return;
              }

              const result = await runTaskNow({
                context: runtime,
                taskId,
                projectRoot: runtime.rootPath,
                trigger: { type: "cron" },
              });

              void logger.log("info", formatTaskLogMessage("Task run finished"), {
                taskId,
                via: "cron",
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
              });
            } catch (error) {
              void logger.log("error", formatTaskLogMessage("Task run failed (scheduler)"), {
                taskId,
                via: "cron",
                error: String(error),
              });
            } finally {
              runningByTaskId.delete(taskId);
            }
          },
        });

        jobsScheduled += 1;
      } catch {
        void logger.log("warn", formatTaskLogMessage("Invalid task cron; skipped"), {
          taskId: item.taskId,
          cron: item.cron,
        });
      }
    }

    const plannedTimeMs = parsePlannedTimeMs(timeRaw);
    if (timeRaw && plannedTimeMs === null) {
      void logger.log("warn", formatTaskLogMessage("Invalid task time; skipped"), {
        taskId: item.taskId,
        time: timeRaw,
      });
      continue;
    }
    if (plannedTimeMs === null) continue;

    try {
      params.engine.register({
        id: `task-time:${item.taskId}`,
        expression: "* * * * *",
        execute: async () => {
          const taskId = String(item.taskId || "").trim();
          if (!taskId) return;

          // 到点前不执行；进程重启后若已过点，将在下一分钟补执行一次。
          if (Date.now() < plannedTimeMs) return;

          // 关键点（中文）：同一 taskId 串行；重叠触发时跳过，避免并发执行污染 run 目录。
          if (runningByTaskId.has(taskId)) {
            void logger.log("warn", formatTaskLogMessage("Task skipped (already running)"), {
              taskId,
              via: "time",
            });
            return;
          }

          let shouldDeactivateOneShot = false;
          runningByTaskId.add(taskId);
          try {
            const latest = await readTask({
              taskId,
              projectRoot: runtime.rootPath,
            });
            if (String(latest.frontmatter.status).toLowerCase() !== "enabled") return;
            const latestPlannedMs = parsePlannedTimeMs(latest.frontmatter.time);
            if (latestPlannedMs === null) return;
            if (Date.now() < latestPlannedMs) return;

            shouldDeactivateOneShot = true;
            const result = await runTaskNow({
              context: runtime,
              taskId,
              projectRoot: runtime.rootPath,
              trigger: { type: "time" },
            });

            void logger.log("info", formatTaskLogMessage("Task run finished"), {
              taskId,
              via: "time",
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
            });
          } catch (error) {
            void logger.log("error", formatTaskLogMessage("Task run failed (scheduler)"), {
              taskId,
              via: "time",
              error: String(error),
            });
          } finally {
            if (shouldDeactivateOneShot) {
              try {
                const latest = await readTask({
                  taskId,
                  projectRoot: runtime.rootPath,
                });
                const { time: _time, ...frontmatterWithoutTime } = latest.frontmatter;
                await writeTask({
                  projectRoot: runtime.rootPath,
                  taskId,
                  overwrite: true,
                  frontmatter: {
                    ...frontmatterWithoutTime,
                    status: "paused",
                  },
                  body: latest.body,
                });
                void logger.log("info", formatTaskLogMessage("One-shot task deactivated after execution"), {
                  taskId,
                  status: "paused",
                });
              } catch (e) {
                void logger.log("warn", formatTaskLogMessage("Failed to deactivate one-shot task"), {
                  taskId,
                  error: String(e),
                });
              }
            }
            runningByTaskId.delete(taskId);
          }
        },
      });

      jobsScheduled += 1;
    } catch {
      void logger.log("warn", formatTaskLogMessage("Invalid task time trigger; skipped"), {
        taskId: item.taskId,
        time: timeRaw,
      });
    }
  }

  return {
    tasksFound: tasks.length,
    jobsScheduled,
  };
}
