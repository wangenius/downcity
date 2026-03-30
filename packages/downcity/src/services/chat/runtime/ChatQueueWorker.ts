/**
 * ChatQueueWorker：chat service 侧队列执行器。
 *
 * 关键点（中文）
 * - 消费 services/chat 的队列模块
 * - 通过 RequestContext（ALS）透传 sessionId
 * - 支持 step 边界合并（同 lane 新消息可插入当前 run）
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { SessionRunResult } from "@/types/SessionRun.js";
import type {
  SessionUserMessageV1,
} from "@/types/SessionMessage.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { ChatQueueWorkerConfig } from "@/types/ChatQueueWorker.js";
import type { JsonObject } from "@/types/Json.js";
import type { ChatQueueItem } from "@services/chat/types/ChatQueue.js";
import {
  onChatQueueEnqueue,
  shiftChatQueueItem,
  listChatQueueLanes,
  clearChatQueueLane,
  drainChatQueueLane,
  getChatQueueLaneSize,
} from "./ChatQueue.js";
import { getChatSender } from "./ChatSendRegistry.js";
import {
  pickLastSuccessfulChatSendText,
} from "./UserVisibleText.js";
import { extractTextFromUiMessage } from "./UIMessageTransformer.js";
import {
  appendChatIngressMessageIfNeeded,
  appendChatRunErrorMessage,
  buildChatIngressExtra,
  persistChatRunResult,
  shouldAppendChatIngressMessage,
  toMergedStepUserMessage,
} from "./ChatQueueSessionBridge.js";
import {
  buildChannelErrorText,
  collectInitialBurstItems,
  normalizeChatQueueWorkerConfig,
} from "./ChatQueueWorkerSupport.js";
import {
  dispatchAssistantMessageDirect,
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
  private readonly runtime: ExecutionRuntime;
  private readonly config: ChatQueueWorkerConfig;

  private readonly lanes: Map<string, LaneState> = new Map();
  private readonly runnable: string[] = [];
  private readonly runnableSet: Set<string> = new Set();
  private runningTotal: number = 0;
  private unsubscribe?: () => void;
  private stopped = false;

  constructor(params: {
    logger: Logger;
    context: ExecutionRuntime;
    config?: Partial<ChatQueueWorkerConfig>;
  }) {
    this.logger = params.logger;
    this.runtime = params.context;
    this.config = normalizeChatQueueWorkerConfig(params.config);
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
      session: this.requireContext(),
      item,
    });
  }

  private handleControl(item: ChatQueueItem): boolean {
    const control = item.control;
    if (!control) return false;
    if (control.type === "clear") {
      this.requireContext().clearRuntime(item.sessionId);
      clearChatQueueLane(item.sessionId);
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

    if (first.kind === "audit") {
      await this.appendSessionMessageIfNeeded(first);
      return;
    }

    const serviceContext = this.requireContext();
    let runItem = first;

    let clearRequested = false;
    const initialBurstItems = await collectInitialBurstItems({
      laneKey,
      first,
      config: this.config,
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
      const drainedItems = drainChatQueueLane(laneKey);
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
    let lastDirectDispatchedStepText = "";
    const onAssistantStepCallback = async (params: {
      text: string;
      stepIndex: number;
    }): Promise<void> => {
      const stepText = String(params.text || "").trim();
      if (!stepText) return;
      const dispatched = await dispatchAssistantTextDirect({
        logger: this.logger,
        runtime: this.runtime,
        sessionId: runItem.sessionId,
        assistantText: stepText,
        phase: "step",
      });
      // 关键点（中文）：记录最近一次已发送的 step 文本，避免最终消息重复回发。
      if (dispatched) {
        lastDirectDispatchedStepText = stepText;
      }
    };

    const typing = this.startTypingHeartbeat(runItem);
    let result: SessionRunResult;
    try {
      result = await serviceContext.run({
        sessionId: runItem.sessionId,
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
          sessionId: runItem.sessionId,
          text: channelErrorText,
        });
      } catch {
        // ignore
      }

      await dispatchTextToChannel({
        logger: this.logger,
        runtime: this.runtime,
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
      serviceContext.clearRuntime(runItem.sessionId);
      clearChatQueueLane(runItem.sessionId);
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

    try {
      // 关键点（中文）
      // - step 文本用于中途反馈；最终消息用于收口。
      // - 若最终文本与最近一次 step 已发送文本完全一致，则跳过最终 direct 回发，避免重复。
      // - 无论成功/失败，只要 direct/cmd 没有把最终可见文本送到 channel，都要强制兜底回发。
      const assistantText = extractTextFromUiMessage(result.assistantMessage).trim();
      const userVisibleText = pickLastSuccessfulChatSendText(result.assistantMessage).trim();
      const finalChannelText = assistantText || userVisibleText;
      const duplicatedWithStep =
        finalChannelText.length > 0 &&
        finalChannelText === lastDirectDispatchedStepText;
      const dispatchedDirect = duplicatedWithStep
        ? true
        : await dispatchAssistantMessageDirect({
            logger: this.logger,
            runtime: this.runtime,
            sessionId: runItem.sessionId,
            assistantMessage: result.assistantMessage,
          });
      // 关键点（中文）：在 cmd 模式下 direct 分发会返回 false，这里无论成功/失败都强制兜底回发。
      if (!dispatchedDirect && finalChannelText) {
        await dispatchTextToChannel({
          logger: this.logger,
          runtime: this.runtime,
          sessionId: runItem.sessionId,
          text:
            result.success === false
              ? finalChannelText || "❌ 执行失败，请稍后重试。"
              : finalChannelText,
          messageId: runItem.messageId,
          phase: result.success === false ? "error" : "final",
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * 读取 session 端口。
   *
   * 关键点（中文）
   * - 在使用点显式校验，避免隐藏依赖来源。
   */
  private requireContext() {
    return this.runtime.session;
  }
}
