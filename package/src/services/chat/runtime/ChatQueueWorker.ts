/**
 * ChatQueueWorker：chat service 侧队列执行器。
 *
 * 关键点（中文）
 * - 消费 services/chat 的队列模块
 * - 通过 RequestContext（ALS）透传 contextId
 * - 支持 step 边界合并（同 lane 新消息可插入当前 run）
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { AgentResult } from "@main/types/Agent.js";
import type {
  ShipContextUserMessageV1,
  ContextMessageV1,
} from "@main/types/ContextMessage.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
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
import { sendActionByChatKey } from "./ChatkeySend.js";
import { resolveChatMethod } from "./ChatMethod.js";
import { extractTextFromUiMessage } from "./UIMessageTransformer.js";
import { parseDirectDispatchAssistantText } from "./DirectDispatchParser.js";
import { sendChatTextByChatKey } from "../Action.js";

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
    return item.kind === "exec";
  }

  /**
   * 统一补齐入站消息分类标记。
   *
   * 关键点（中文）
   * - 当前 message history 仅写入 `exec`，所以固定写 `ingressKind=exec`。
   */
  private buildIngressExtra(item: ChatQueueItem): JsonObject {
    const base = item.extra && typeof item.extra === "object" ? item.extra : {};
    return {
      ...base,
      ingressKind: "exec",
    };
  }

  private async appendHistory(item: ChatQueueItem): Promise<void> {
    if (!this.shouldAppendHistory(item)) return;
    await this.requireContext().appendUserMessage({
      contextId: item.contextId,
      text: item.text,
      extra: this.buildIngressExtra(item),
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

  /**
   * 是否启用 direct 回发模式。
   *
   * 关键点（中文）
   * - 默认就是 `direct`；仅当显式配置 `services.chat.method = cmd` 时关闭。
   */
  private isDirectModeEnabled(): boolean {
    return resolveChatMethod(this.runtime.config) === "direct";
  }

  /**
   * direct 模式：把 assistant 纯文本直接投递到 chat。
   *
   * 关键点（中文）
   * - 支持 frontmatter metadata 协议：主文本发送 + reaction 动作发送。
   * - 附件能力保留 `<file>` 标签（会在 parser 中转换为附件指令行）。
   * - 仅消费用户可见文本与控制协议，不转发工具日志/结构化输出。
   * - 发送失败只记录 warning，不中断主执行流程。
   */
  private async dispatchAssistantTextDirect(params: {
    contextId: string;
    assistantText: string;
  }): Promise<boolean> {
    if (!this.isDirectModeEnabled()) return false;

    const plan = parseDirectDispatchAssistantText({
      assistantText: params.assistantText,
      fallbackChatKey: params.contextId,
    });
    if (!plan) return false;
    let dispatched = false;

    if (plan.text) {
      dispatched = true;
      const textResult = await sendChatTextByChatKey({
        context: this.runtime,
        chatKey: plan.text.chatKey,
        text: plan.text.text,
        replyToMessage: plan.text.replyToMessage,
        messageId: plan.text.messageId,
        delayMs: plan.text.delayMs,
        sendAtMs: plan.text.sendAtMs,
      });
      if (!textResult.success) {
        this.logger.warn("Direct chat text dispatch failed", {
          contextId: params.contextId,
          targetChatKey: plan.text.chatKey,
          error: textResult.error || "chat send failed",
        });
      }
    }

    for (const reaction of plan.reactions) {
      dispatched = true;
      const reactResult = await sendActionByChatKey({
        context: this.runtime,
        chatKey: reaction.chatKey,
        action: "react",
        messageId: reaction.messageId,
        reactionEmoji: reaction.emoji,
        reactionIsBig: reaction.big,
      });
      if (!reactResult.success) {
        this.logger.warn("Direct chat reaction dispatch failed", {
          contextId: params.contextId,
          targetChatKey: reaction.chatKey,
          error: reactResult.error || "chat react failed",
        });
      }
    }

    return dispatched;
  }

  /**
   * direct 模式：从 assistant UIMessage 中提取文本并投递。
   */
  private async dispatchAssistantMessageDirect(params: {
    contextId: string;
    assistantMessage: ContextMessageV1 | null | undefined;
  }): Promise<boolean> {
    return this.dispatchAssistantTextDirect({
      contextId: params.contextId,
      assistantText: extractTextFromUiMessage(params.assistantMessage),
    });
  }

  private async processOne(laneKey: string, first: ChatQueueItem): Promise<void> {
    if (first.kind === "control") {
      this.handleControl(first);
      return;
    }

    await this.appendHistory(first);
    if (first.kind === "audit") return;

    const serviceContext = this.requireContext();
    let dispatchedDirectStepCount = 0;

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
                extra: this.buildIngressExtra(item),
              },
              parts: [{ type: "text", text }],
            });
          }
        }
      }
      return mergedExecMessages;
    };
    const onAssistantStepCallback = async (params: {
      text: string;
      stepIndex: number;
    }): Promise<void> => {
      const dispatched = await this.dispatchAssistantTextDirect({
        contextId: first.contextId,
        assistantText: params.text,
      });
      if (dispatched) {
        dispatchedDirectStepCount += 1;
      }
    };

    const typing = this.startTypingHeartbeat(first);
    let result: AgentResult;
    try {
      result = await serviceContext.run({
        contextId: first.contextId,
        query: first.text,
        onStepCallback,
        onAssistantStepCallback,
      });
    } finally {
      typing.stop();
    }

    if (clearRequested) {
      serviceContext.clearAgent(first.contextId);
      clearChatQueueLane(first.contextId);
    }

    try {
      await serviceContext.appendAssistantMessage({
        contextId: first.contextId,
        message: result.assistantMessage,
      });
    } catch {
      // ignore
    }

    try {
      // 关键点（中文）：若 step 期间已分条发送，则不再做最终聚合回发，避免重复。
      if (dispatchedDirectStepCount === 0) {
        await this.dispatchAssistantMessageDirect({
          contextId: first.contextId,
          assistantMessage: result.assistantMessage,
        });
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
