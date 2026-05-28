/**
 * Runtime plugin Schedule 执行器。
 *
 * 关键点（中文）
 * - 只负责“把到点任务执行掉并更新状态”。
 * - 不负责调度入口和轮询生命周期管理。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { PluginScheduleStore } from "@/plugin/core/schedule/Store.js";
import { runPluginCommand } from "@/plugin/core/Manager.js";

/**
 * 执行当前已到点的 pending 任务。
 */
export async function runDueScheduledJobs(params: {
  context: AgentContext;
  store: PluginScheduleStore;
}): Promise<void> {
  const dueJobs = params.store.listDuePendingJobs(Date.now());
  for (const job of dueJobs) {
    const claimed = params.store.markJobRunning(job.id);
    if (!claimed) continue;

    try {
      const result = await runPluginCommand({
        pluginName: job.pluginName,
        command: job.actionName,
        payload: job.payload,
        context: params.context,
      });
      if (!result.success) {
        params.store.markJobFailed(job.id, result.message || "scheduled job failed");
        params.context.logger.warn("[schedule] job failed", {
          jobId: job.id,
          pluginName: job.pluginName,
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
        pluginName: job.pluginName,
        actionName: job.actionName,
        error: String(error),
      });
    }
  }
}
