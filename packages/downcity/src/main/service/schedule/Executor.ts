/**
 * Service Schedule 执行器。
 *
 * 关键点（中文）
 * - 只负责“把到点任务执行掉并更新状态”。
 * - 不负责调度入口和轮询生命周期管理。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ServiceScheduleStore } from "./Store.js";
import { runServiceCommand } from "@/main/service/Manager.js";

/**
 * 执行当前已到点的 pending 任务。
 */
export async function runDueScheduledJobs(params: {
  context: ExecutionContext;
  store: ServiceScheduleStore;
}): Promise<void> {
  const dueJobs = params.store.listDuePendingJobs(Date.now());
  for (const job of dueJobs) {
    const claimed = params.store.markJobRunning(job.id);
    if (!claimed) continue;

    try {
      const result = await runServiceCommand({
        serviceName: job.serviceName,
        command: job.actionName,
        payload: job.payload,
        context: params.context,
      });
      if (!result.success) {
        params.store.markJobFailed(job.id, result.message || "scheduled job failed");
        params.context.logger.warn("[schedule] job failed", {
          jobId: job.id,
          serviceName: job.serviceName,
          actionName: job.actionName,
          error: result.message || "scheduled job failed",
        });
        continue;
      }

      params.store.markJobSucceeded(job.id);
    } catch (error) {
      params.store.markJobFailed(job.id, String(error));
      params.context.logger.warn("[schedule] job failed", {
        jobId: job.id,
        serviceName: job.serviceName,
        actionName: job.actionName,
        error: String(error),
      });
    }
  }
}
