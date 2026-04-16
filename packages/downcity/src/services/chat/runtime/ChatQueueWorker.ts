/**
 * ChatQueueWorker：chat service 侧队列执行器。
 *
 * 关键点（中文）
 * - 消费 services / chat 的队列模块
 * - 通过 SessionRunScope（ALS）透传 sessionId
 * - 支持 step 边界合并（同 lane 新消息可插入当前 run）
 */

import type { Logger } from "@shared/utils/logger/Logger.js";
import type { SessionRunResult } from "@/types/session/SessionRun.js";
import type {
  SessionUserMessageV1,
} from "@/types/session/SessionMessages.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { ChatQueueWorkerConfig } from "@/shared/types/ChatQueueWorker.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { ChatQueueItem } from "@services/chat/types/ChatQueue.js";
import {
  getSharedChatQueueStore,
} from "./ChatQueue.js";
import { getChatSender } from "./ChatSendRegistry.js";
import {
  appendChatIngressMessageIfNeeded,
  appendChatRunErrorMessage,
  buildChatIngressExtra,
  persistChatRunResult,
  shouldAppendChatIngressMessage,
  toMergedStepUserMessage,
} from "./ChatQueueSessionBridge.js";
import {
  hasPersistedAssistantSteps,
  pickLastSuccessfulChatSendText,
} from "./UserVisibleText.js";
import {
  buildChannelErrorText,
  collectInitialBurstItems,
  normalizeChatQueueWorkerConfig,
} from "./ChatQueueWorkerSupport.js";
import type { ChatQueueStorePort } from "./ChatQueueStore.js";
import {
  dispatchAssistantTextDirect,
  dispatchTextToChannel,
} from "./ChatQueueReplyDispatch.js";

const TYPING_ACTION_INTERVAL_MS = 4_000;

type LaneState = {
  key: string;
  running: boolean;
};

export class ChatQueueWorker {
  private readonly logger: Logger;
  private readonly context: AgentContext;
  private readonly config: ChatQueueWorkerConfig;
  private readonly queueStore: ChatQueueStorePort;

  private readonly lanes: Map<string, LaneState> = new Map();
  private readonly runnable: string[] = [];
  private readonly runnableSet: Set<string> = new Set();
  private runningTotal: number = 0;
  private unsubscribe?: () => void;
  private stopped = false;

  constructor(params: {
    logger: Logger;
    context: AgentContext;
    queueStore?: ChatQueueStorePort;
    config?: Partial<ChatQueueWorkerConfig>;
  }) {
    this.logger = params.logger;
    this.context = params.context;
    this.config = normalizeChatQueueWorkerConfig(params.config);
    this.queueStore = params.queueStore || getSharedChatQueueStore();
  }

  /**
   * 启动 worker。
   */
  start(): void {
    if (this.unsubscribe) return;
    this.stopped = false;
    this.unsubscribe = this.queueStore.onEnqueue((laneKey) => {
      this.markRunnable(laneKey);
      void this.requestTurnCancelIfSupported(laneKey);
      void this.kick();
    });

    // 初始化已有 lanes
    for (const laneKey of this.queueStore.listLanes()) {
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
      if (this.queueStore.getLaneSize(key) === 0) continue;
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
            if (this.queueStore.getLaneSize(lane.key) > 0) {
              this.markRunnable(lane.key);
            }
            void this.kick();
          }
        });
    }
  }

  private async runLaneOnce(lane: LaneState): Promise<void> {
    const first = this.queueStore.shift(lane.key);
    if (!first) return;
    await this.processOne(lane.key, first);
  }

  /**
   * 若底层 runtime 支持取消当前 turn，则在新消息入队时立刻触发。
   *
   * 关键点（中文）
   * - 只对支持显式取消的 runtime 生效（主要是 ACP）。
   * - 失败不影响正常排队；worker 仍会走串行兜底。
   */
  private async requestTurnCancelIfSupported(sessionId: string): Promise<void> {
    const sessionKey = String(sessionId || "").trim();
    if (!sessionKey) return;
    try {
      const runtime = this.context.session.get(sessionKey).getExecutor();
      if (typeof runtime.requestCancelCurrentTurn !== "function") return;
      await runtime.requestCancelCurrentTurn();
    } catch {
      // ignore
    }
  }

  private shouldAppendSessionMessage(item: ChatQueueItem): boolean {
    return shouldAppendChatIngressMessage(item);
  }

  /**
   * 统一补齐入站消息分类标记。
   *
   * 关键点（中文）
   * - 当前 message history 仅写入 `exec`，所以固定写 `ingressKind=exec`。
   */
  private buildIngressExtra(item: ChatQueueItem): JsonObject {
    return buildChatIngressExtra(item);
  }

  private async appendSessionMessageIfNeeded(item: ChatQueueItem): Promise<void> {
    if (!this.shouldAppendSessionMessage(item)) return;
    await appendChatIngressMessageIfNeeded({
      session: this.requireContext(item.sessionId),
      item,
    });
  }

  private handleControl(item: ChatQueueItem): boolean {
    const control = item.control;
    if (!control) return false;
    if (control.type === "clear") {
      this.requireContext(item.sessionId).clearExecutor();
      this.queueStore.clear(item.sessionId);
      return true;
    }
    return false;
  }

  /**
   * 在单次执行期间维持“正在输入”心跳。
   *
   * 关键点（中文）
   * - 通过 services / chat 的 dispatcher 发送动作（不经过 main bindings）
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

  /**
   * 发送 step 文本到 chat。
   *
   * 关键点（中文）
   * - step 必须在当前回调阶段真正送达，不能依赖 run 结束后的 final 兜底。
   * - 先尝试 direct 路径，保留 frontmatter / reaction 等语义。
   * - 若 direct 未送达，则立刻回退到普通 channel 文本发送。
   */
  private async dispatchAssistantStepMessage(params: {
    sessionId: string;
    text: string;
    messageId?: string;
  }): Promise<boolean> {
    const stepText = String(params.text || "").trim();
    if (!stepText) return false;

    const dispatchedDirectly = await dispatchAssistantTextDirect({
      logger: this.logger,
      context: this.context,
      sessionId: params.sessionId,
      assistantText: stepText,
      phase: "step",
    });
    if (dispatchedDirectly) {
      return true;
    }

    return await dispatchTextToChannel({
      logger: this.logger,
      context: this.context,
      sessionId: params.sessionId,
      text: stepText,
      messageId: params.messageId,
      phase: "step",
    });
  }

  private async processOne(laneKey: string, first: ChatQueueItem): Promise<void> {
    if (first.kind === "control") {
      this.handleControl(first);
      return;
    }

    if (first.kind === "audit") {
      await this.appendSessionMessageIfNeeded(first);
      return;
    }

    const serviceContext = this.requireContext(first.sessionId);
    let runItem = first;

    let clearRequested = false;
    const initialBurstItems = await collectInitialBurstItems({
      laneKey,
      first,
      config: this.config,
      queueStore: this.queueStore,
    });
    for (const item of initialBurstItems) {
      if (item.kind === "control") {
        if (item.control?.type === "clear") clearRequested = true;
        continue;
      }
      await this.appendSessionMessageIfNeeded(item);
      if (item.kind === "exec") {
        runItem = item;
      }
    }

    const onStepCallback = async (): Promise<SessionUserMessageV1[]> => {
      const drainedItems = this.queueStore.drain(laneKey);
      if (drainedItems.length === 0) return [];
      const mergedExecMessages: SessionUserMessageV1[] = [];
      for (const item of drainedItems) {
        if (item.kind === "control") {
          if (item.control?.type === "clear") clearRequested = true;
          continue;
        }

        await this.appendSessionMessageIfNeeded(item);
        if (item.kind === "exec") {
          const mergedMessage = toMergedStepUserMessage(item);
          if (mergedMessage) mergedExecMessages.push(mergedMessage);
        }
      }
      return mergedExecMessages;
    };
    let assistantStepDispatched = false;
    const onAssistantStepCallback = async (params: {
      text: string;
      stepIndex: number;
      visibility?: "visible" | "internal";
    }): Promise<void> => {
      if (params.visibility === "internal") return;
      const stepText = String(params.text || "").trim();
      if (!stepText) return;
      const dispatched = await this.dispatchAssistantStepMessage({
        sessionId: runItem.sessionId,
        text: stepText,
        messageId: runItem.messageId,
      });
      if (dispatched) {
        assistantStepDispatched = true;
      }
    };

    const typing = this.startTypingHeartbeat(runItem);
    let result: SessionRunResult;
    try {
      result = await serviceContext.run({
        query: runItem.text,
        onStepCallback,
        onAssistantStepCallback,
      });
    } catch (error) {
      const channelErrorText = buildChannelErrorText(error);
      this.logger.error("ChatQueueWorker execution failed", {
        sessionId: runItem.sessionId,
        error: String(error),
      });

      try {
        await appendChatRunErrorMessage({
          session: serviceContext,
          text: channelErrorText,
        });
      } catch {
        // ignore
      }

      await dispatchTextToChannel({
        logger: this.logger,
        context: this.context,
        sessionId: runItem.sessionId,
        text: channelErrorText,
        messageId: runItem.messageId,
        phase: "error",
      });
      return;
    } finally {
      typing.stop();
    }

    if (clearRequested) {
      serviceContext.clearExecutor();
      this.queueStore.clear(runItem.sessionId);
    }

    const stopReason = String(
      result.assistantMessage?.metadata?.extra?.stopReason || "",
    ).trim();
    if (stopReason === "cancelled") {
      return;
    }

    try {
      await persistChatRunResult({
        session: serviceContext,
        sessionId: runItem.sessionId,
        result,
      });
    } catch {
      // ignore
    }

    // 关键点（中文）：
    // - 若 step 文本已经单独回发，则保持当前行为，不再重复发送最终 merged assistant。
    // - 若本轮没有任何 step 回发，则必须把最终 assistant 文本补发到 chat channel，
    //   否则会出现“context message 已写入，但 chat history / 实际渠道没有回复”的断链。
    if (assistantStepDispatched || hasPersistedAssistantSteps(result.assistantMessage)) {
      return;
    }

    const finalAssistantText = pickLastSuccessfulChatSendText(result.assistantMessage);
    if (!finalAssistantText) {
      return;
    }

    const dispatchedDirectly = await dispatchAssistantTextDirect({
      logger: this.logger,
      context: this.context,
      sessionId: runItem.sessionId,
      assistantText: finalAssistantText,
      phase: "final",
    });
    if (dispatchedDirectly) {
      return;
    }

    await dispatchTextToChannel({
      logger: this.logger,
      context: this.context,
      sessionId: runItem.sessionId,
      text: finalAssistantText,
      messageId: runItem.messageId,
      phase: "final",
    });
  }

  /**
   * 读取 session 端口。
   *
   * 关键点（中文）
   * - 在使用点显式校验，避免隐藏依赖来源。
   */
  private requireContext(sessionId: string) {
    return this.context.session.get(sessionId);
  }
}
