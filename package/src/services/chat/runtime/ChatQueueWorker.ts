/**
 * ChatQueueWorker：chat service 侧队列执行器。
 *
 * 关键点（中文）
 * - 消费 services/chat 的队列模块
 * - 通过 RequestContext（ALS）透传 contextId
 * - 支持 step 边界合并（同 lane 新消息可插入当前 run）
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { AgentResult } from "@core/types/Agent.js";
import type { ShipContextUserMessageV1 } from "@core/types/ContextMessage.js";
import type { ServiceRuntime } from "@main/service/types/ServiceRuntimePorts.js";
import { withRequestContext } from "@main/service/RequestContext.js";
import type { ChatQueueItem } from "@services/chat/types/ChatQueue.js";
import {
  onChatQueueEnqueue,
  shiftChatQueueItem,
  drainChatQueueLane,
  listChatQueueLanes,
  clearChatQueueLane,
  getChatQueueLaneSize,
} from "./ChatQueue.js";
import { getChatSender } from "./ChatSendRegistry.js";

const TYPING_ACTION_INTERVAL_MS = 4_000;

type WorkerConfig = {
  maxConcurrency: number;
};

type LaneState = {
  key: string;
  running: boolean;
};

function normalizeConfig(input?: Partial<WorkerConfig>): WorkerConfig {
  const maxConcurrency =
    typeof input?.maxConcurrency === "number" && Number.isFinite(input.maxConcurrency)
      ? Math.max(1, Math.min(32, Math.floor(input.maxConcurrency)))
      : 2;
  return { maxConcurrency };
}

export class ChatQueueWorker {
  private readonly logger: Logger;
  private readonly runtime: ServiceRuntime;
  private readonly config: WorkerConfig;

  private readonly lanes: Map<string, LaneState> = new Map();
  private readonly runnable: string[] = [];
  private readonly runnableSet: Set<string> = new Set();
  private runningTotal: number = 0;
  private unsubscribe?: () => void;
  private stopped = false;

  constructor(params: {
    logger: Logger;
    context: ServiceRuntime;
    config?: Partial<WorkerConfig>;
  }) {
    this.logger = params.logger;
    this.runtime = params.context;
    this.config = normalizeConfig(params.config);
  }

  /**
   * 启动 worker。
   */
  start(): void {
    if (this.unsubscribe) return;
    this.stopped = false;
    this.unsubscribe = onChatQueueEnqueue((laneKey) => {
      this.markRunnable(laneKey);
      void this.kick();
    });

    // 初始化已有 lanes
    for (const laneKey of listChatQueueLanes()) {
      this.markRunnable(laneKey);
    }
    void this.kick();
  }

  /**
   * 停止 worker（不清队列）。
   */
  stop(): void {
    this.stopped = true;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  }

  private getOrCreateLane(key: string): LaneState {
    const existing = this.lanes.get(key);
    if (existing) return existing;
    const lane: LaneState = { key, running: false };
    this.lanes.set(key, lane);
    return lane;
  }

  private markRunnable(key: string): void {
    if (this.runnableSet.has(key)) return;
    this.runnableSet.add(key);
    this.runnable.push(key);
  }

  private pickNextRunnableLane(): LaneState | null {
    while (this.runnable.length > 0) {
      const key = this.runnable.shift()!;
      this.runnableSet.delete(key);
      const lane = this.getOrCreateLane(key);
      if (lane.running) continue;
      if (getChatQueueLaneSize(key) === 0) continue;
      return lane;
    }
    return null;
  }

  private async kick(): Promise<void> {
    if (this.stopped) return;
    while (this.runningTotal < this.config.maxConcurrency) {
      const lane = this.pickNextRunnableLane();
      if (!lane) return;

      lane.running = true;
      this.runningTotal += 1;
      void this.runLaneOnce(lane)
        .catch((err) => {
          this.logger.error(`ChatQueueWorker lane failed: ${String(err)}`);
        })
        .finally(() => {
          lane.running = false;
          this.runningTotal -= 1;
          if (!this.stopped) {
            if (getChatQueueLaneSize(lane.key) > 0) {
              this.markRunnable(lane.key);
            }
            void this.kick();
          }
        });
    }
  }

  private async runLaneOnce(lane: LaneState): Promise<void> {
    const first = shiftChatQueueItem(lane.key);
    if (!first) return;
    await this.processOne(lane.key, first);
  }

  private shouldAppendHistory(item: ChatQueueItem): boolean {
    return item.kind === "exec" || item.kind === "audit";
  }

  private async appendHistory(item: ChatQueueItem): Promise<void> {
    if (!this.shouldAppendHistory(item)) return;
    await this.requireContext().appendUserMessage({
      contextId: item.contextId,
      text: item.text,
      extra: item.extra,
    });
  }

  private handleControl(item: ChatQueueItem): boolean {
    const control = item.control;
    if (!control) return false;
    if (control.type === "clear") {
      this.requireContext().clearAgent(item.contextId);
      clearChatQueueLane(item.contextId);
      return true;
    }
    return false;
  }

  /**
   * 在单次执行期间维持“正在输入”心跳。
   *
   * 关键点（中文）
   * - 通过 services/chat 的 dispatcher 发送动作（不经过 main bindings）
   * - 先发送一次，再按固定间隔续发
   * - 发送失败不影响主执行流程（best-effort）
   */
  private startTypingHeartbeat(item: ChatQueueItem): { stop: () => void } {
    const chatId = String(item.targetId || "").trim();
    if (!chatId) return { stop: () => {} };

    const dispatcher = getChatSender(item.channel);
    const sendAction = dispatcher?.sendAction;
    if (typeof sendAction !== "function") {
      return { stop: () => {} };
    }

    const sendOnce = async () => {
      try {
        await sendAction({
          chatId,
          action: "typing",
          ...(typeof item.threadId === "number"
            ? { messageThreadId: item.threadId }
            : {}),
          ...(typeof item.targetType === "string" && item.targetType
            ? { chatType: item.targetType }
            : {}),
          ...(typeof item.messageId === "string" && item.messageId
            ? { messageId: item.messageId }
            : {}),
        });
      } catch {
        // ignore
      }
    };

    void sendOnce();
    const timer = setInterval(() => {
      void sendOnce();
    }, TYPING_ACTION_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();

    return {
      stop: () => clearInterval(timer),
    };
  }

  private async processOne(laneKey: string, first: ChatQueueItem): Promise<void> {
    if (first.kind === "control") {
      this.handleControl(first);
      return;
    }

    await this.appendHistory(first);
    if (first.kind === "audit") return;

    const serviceContext = this.requireContext();
    const agent = serviceContext.getAgent(first.contextId);
    if (!agent.isInitialized()) {
      await agent.initialize();
    }

    let clearRequested = false;
    const onStepCallback = async (): Promise<ShipContextUserMessageV1[]> => {
      const drainedItems = drainChatQueueLane(laneKey);
      if (drainedItems.length === 0) return [];
      const mergedExecMessages: ShipContextUserMessageV1[] = [];
      for (const item of drainedItems) {
        if (item.kind === "control") {
          if (item.control?.type === "clear") clearRequested = true;
          continue;
        }

        await this.appendHistory(item);
        if (item.kind === "exec") {
          const text = String(item.text ?? "").trim();
          if (text) {
            mergedExecMessages.push({
              id: `u:${item.contextId}:${item.id}`,
              role: "user",
              metadata: {
                v: 1,
                ts: Date.now(),
                contextId: item.contextId,
                source: "ingress",
                kind: "normal",
                ...(item.extra ? { extra: item.extra } : {}),
              },
              parts: [{ type: "text", text }],
            });
          }
        }
      }
      return mergedExecMessages;
    };

    const typing = this.startTypingHeartbeat(first);
    let result: AgentResult;
    try {
      result = await withRequestContext(
        { contextId: first.contextId },
        () =>
          agent.run({
            contextId: first.contextId,
            query: first.text,
            onStepCallback,
          }),
      );
    } finally {
      typing.stop();
    }

    if (clearRequested) {
      serviceContext.clearAgent(first.contextId);
      clearChatQueueLane(first.contextId);
    }

    try {
      const store = serviceContext.getContextStore(first.contextId);
      const assistantMessage = result.assistantMessage;
      if (assistantMessage && typeof assistantMessage === "object") {
        await store.append(assistantMessage);
        void serviceContext.afterContextUpdatedAsync(first.contextId);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 读取 context 端口。
   *
   * 关键点（中文）
   * - 在使用点显式校验，避免隐藏依赖来源。
   */
  private requireContext() {
    return this.runtime.context;
  }
}
