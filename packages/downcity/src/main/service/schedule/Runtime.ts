/**
 * Service Schedule runtime。
 *
 * 关键点（中文）
 * - 使用轻量轮询驱动到点执行，避免为 MVP 引入复杂定时器注册与恢复逻辑。
 * - runtime 重启时会把遗留 `running` 任务回退成 `pending`，然后继续补执行。
 */

import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import { ServiceScheduleStore } from "./Store.js";
import { runDueScheduledJobs } from "./Executor.js";

const SCHEDULE_POLL_INTERVAL_MS = 200;

type ServiceScheduleRuntimeState = {
  timer: NodeJS.Timeout | null;
  ticking: boolean;
  store: ServiceScheduleStore;
  context: ExecutionRuntime;
};

let runtimeState: ServiceScheduleRuntimeState | null = null;

/**
 * 启动持久化调度 runtime。
 */
export async function startServiceScheduleRuntime(
  context: ExecutionRuntime,
): Promise<void> {
  if (runtimeState) return;

  const store = new ServiceScheduleStore(context.rootPath);
  const recovered = store.resetRunningJobsToPending();
  if (recovered > 0) {
    context.logger.warn("[schedule] recovered interrupted running jobs", {
      recovered,
    });
  }

  runtimeState = {
    timer: null,
    ticking: false,
    store,
    context,
  };

  const tick = async () => {
    if (!runtimeState || runtimeState.ticking) return;
    runtimeState.ticking = true;
    try {
      await runDueScheduledJobs({
        context: runtimeState.context,
        store: runtimeState.store,
      });
    } finally {
      if (runtimeState) {
        runtimeState.ticking = false;
      }
    }
  };

  await tick();
  runtimeState.timer = setInterval(() => {
    void tick();
  }, SCHEDULE_POLL_INTERVAL_MS);
}

/**
 * 停止持久化调度 runtime。
 */
export async function stopServiceScheduleRuntime(): Promise<void> {
  if (!runtimeState) return;
  if (runtimeState.timer) {
    clearInterval(runtimeState.timer);
  }
  runtimeState.store.close();
  runtimeState = null;
}
