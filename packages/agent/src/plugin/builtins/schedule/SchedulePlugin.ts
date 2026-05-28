/**
 * SchedulePlugin：通用延迟/定时 plugin action 调度器。
 *
 * 关键点（中文）
 * - 这是 plugin 系统内部的基础设施 plugin，不直接承载业务 action。
 * - 它负责轮询 `PluginScheduleStore`，把到点任务重新派发回对应 plugin action。
 * - 这样调度能力就归属于 plugin lifecycle，而不是 Agent 顶层 lifecycle。
 */

import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import { BasePlugin } from "@/plugin/core/BasePlugin.js";
import { runDueScheduledJobs } from "@/plugin/core/schedule/Executor.js";
import { PluginScheduleStore } from "@/plugin/core/schedule/Store.js";
import type { PluginActions } from "@/plugin/types/Plugin.js";

const SCHEDULE_POLL_INTERVAL_MS = 200;
const SCHEDULE_LOG_PREFIX = "[SCHEDULE]";

function formatScheduleLogMessage(message: string): string {
  return `${SCHEDULE_LOG_PREFIX} ${message}`;
}

type ScheduleRuntimeState = {
  timer: NodeJS.Timeout | null;
  ticking: boolean;
  store: PluginScheduleStore;
  context: AgentContext;
};

/**
 * 通用调度 plugin。
 */
export class SchedulePlugin extends BasePlugin {
  /**
   * 当前 plugin 名称。
   */
  readonly name = "schedule";

  /**
   * 当前 plugin 不暴露业务 action。
   */
  readonly actions: PluginActions = {};

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
          formatScheduleLogMessage("Plugin scheduler started"),
        );
      },
      stop: async (context) => {
        const stopped = await this.stopRuntime();
        if (!stopped) return;
        context.logger.info(
          formatScheduleLogMessage("Plugin scheduler stopped"),
        );
      },
    };
  }

  /**
   * 启动当前实例的调度 runtime。
   */
  async startRuntime(context: AgentContext): Promise<boolean> {
    if (this.runtimeState) return false;

    const store = new PluginScheduleStore(context.rootPath);
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
