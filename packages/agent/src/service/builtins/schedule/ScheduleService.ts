/**
 * ScheduleService：通用延迟/定时 service action 调度器。
 *
 * 关键点（中文）
 * - 这是 service 系统内部的基础设施 service，不直接承载业务 action。
 * - 它负责轮询 `ServiceScheduleStore`，把到点任务重新派发回对应 service action。
 * - 这样调度能力就归属于 service lifecycle，而不是 Agent 顶层 lifecycle。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import { BaseService } from "@/service/builtins/BaseService.js";
import { runDueScheduledJobs } from "@/service/core/schedule/Executor.js";
import { ServiceScheduleStore } from "@/service/core/schedule/Store.js";
import type { ServiceActions } from "@/service/types/Service.js";

const SCHEDULE_POLL_INTERVAL_MS = 200;
const SCHEDULE_LOG_PREFIX = "[SCHEDULE]";

function formatScheduleLogMessage(message: string): string {
  return `${SCHEDULE_LOG_PREFIX} ${message}`;
}

type ScheduleRuntimeState = {
  timer: NodeJS.Timeout | null;
  ticking: boolean;
  store: ServiceScheduleStore;
  context: AgentContext;
};

/**
 * 通用调度 service。
 */
export class ScheduleService extends BaseService {
  /**
   * 当前 service 名称。
   */
  readonly name = "schedule";

  /**
   * 当前 service 不暴露业务 action。
   */
  readonly actions: ServiceActions = {};

  /**
   * 当前实例持有的调度 runtime 状态。
   */
  private runtimeState: ScheduleRuntimeState | null = null;

  constructor(agent: AgentRuntime | null) {
    super(agent);

    this.lifecycle = {
      start: async (context) => {
        const started = await this.startRuntime(context);
        if (!started) return;
        context.logger.info(
          formatScheduleLogMessage("Service scheduler started"),
        );
      },
      stop: async (context) => {
        const stopped = await this.stopRuntime();
        if (!stopped) return;
        context.logger.info(
          formatScheduleLogMessage("Service scheduler stopped"),
        );
      },
    };
  }

  /**
   * 启动当前实例的调度 runtime。
   */
  async startRuntime(context: AgentContext): Promise<boolean> {
    if (this.runtimeState) return false;

    const store = new ServiceScheduleStore(context.rootPath);
    const recovered = store.resetRunningJobsToPending();
    if (recovered > 0) {
      context.logger.warn(
        formatScheduleLogMessage("Recovered interrupted running jobs"),
        { recovered },
      );
    }

    this.runtimeState = {
      timer: null,
      ticking: false,
      store,
      context,
    };

    const tick = async () => {
      const state = this.runtimeState;
      if (!state || state.ticking) return;
      state.ticking = true;
      try {
        await runDueScheduledJobs({
          context: state.context,
          store: state.store,
        });
      } finally {
        const current = this.runtimeState;
        if (current) {
          current.ticking = false;
        }
      }
    };

    await tick();
    this.runtimeState.timer = setInterval(() => {
      void tick();
    }, SCHEDULE_POLL_INTERVAL_MS);

    return true;
  }

  /**
   * 停止当前实例的调度 runtime。
   */
  async stopRuntime(): Promise<boolean> {
    if (!this.runtimeState) return false;
    const current = this.runtimeState;
    this.runtimeState = null;
    if (current.timer) {
      clearInterval(current.timer);
    }
    current.store.close();
    return true;
  }
}
