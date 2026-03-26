/**
 * ChatQueueWorker：chat service 侧队列执行器。
 *
 * 关键点（中文）
 * - 消费 services/chat 的队列模块
 * - 通过 RequestContext（ALS）透传 contextId
 * - 支持 step 边界合并（同 lane 新消息可插入当前 run）
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { AgentResult } from "@agent/types/Agent.js";
import type {
  ShipContextUserMessageV1,
  ContextMessageV1,
} from "@agent/types/ContextMessage.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type { ChatQueueItem } from "@services/chat/types/ChatQueue.js";
import { drainDeferredPersistedUserMessages } from "@agent/context/manager/RequestContext.js";
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
import {
  hasPersistedAssistantSteps,
  pickLastSuccessfulChatSendText,
} from "./UserVisibleText.js";
import { sendChatTextByChatKey } from "../Action.js";
import {
  emitChatReplyEffect,
  prepareChatReplyText,
  resolveChatReplyTarget,
} from "./ReplyDispatch.js";

const TYPING_ACTION_INTERVAL_MS = 4_000;
const CHANNEL_ERROR_TEXT_MAX_LENGTH = 480;
const DEFAULT_MERGE_DEBOUNCE_MS = 600;
const DEFAULT_MERGE_MAX_WAIT_MS = 2_000;
const BURST_MERGE_POLL_INTERVAL_MS = 20;

/**
 * 判断是否为上游模型服务临时不可用。
 *
 * 关键点（中文）
 * - 这里不依赖 provider 私有错误类型，统一基于错误文本做稳健匹配。
 * - 主要覆盖 AI SDK 的 RetryError / APICallError 以及 503 场景。
 */
function isTemporaryModelServiceUnavailable(error: unknown): boolean {
  const msg = String(error ?? "");
  return (
    /Service temporarily unavailable/i.test(msg) ||
    /AI_RetryError/i.test(msg) ||
    /AI_APICallError/i.test(msg) ||
    /maxRetriesExceeded/i.test(msg) ||
    /\b503\b/.test(msg)
  );
}

/**
 * 构造回发到 channel 的失败文本。
 *
 * 关键点（中文）
 * - 文本必须短，避免把大型错误对象原样透出给用户。
 * - 对“临时不可用”给出明确可执行建议（稍后重试）。
 */
function buildChannelErrorText(error: unknown): string {
  if (isTemporaryModelServiceUnavailable(error)) {
    return "⚠️ 模型服务暂时不可用（503），系统已自动重试但仍失败，请稍后再试。";
  }

  const normalized = String(error ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "❌ 执行失败，请稍后重试。";
  }

  const clipped =
    normalized.length > CHANNEL_ERROR_TEXT_MAX_LENGTH
      ? `${normalized.slice(0, CHANNEL_ERROR_TEXT_MAX_LENGTH)}…`
      : normalized;
  return `❌ 执行失败：${clipped}`;
}

type WorkerConfig = {
  maxConcurrency: number;
  mergeDebounceMs: number;
  mergeMaxWaitMs: number;
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

  const mergeDebounceMs =
    typeof input?.mergeDebounceMs === "number" &&
    Number.isFinite(input.mergeDebounceMs)
      ? Math.max(0, Math.min(60_000, Math.floor(input.mergeDebounceMs)))
      : DEFAULT_MERGE_DEBOUNCE_MS;

  const mergeMaxWaitMs =
    typeof input?.mergeMaxWaitMs === "number" &&
    Number.isFinite(input.mergeMaxWaitMs)
      ? Math.max(0, Math.min(120_000, Math.floor(input.mergeMaxWaitMs)))
      : DEFAULT_MERGE_MAX_WAIT_MS;

  return { maxConcurrency, mergeDebounceMs, mergeMaxWaitMs };
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

  /**
   * 是否启用“启动前消息合并”。
   *
   * 关键点（中文）
   * - 两个阈值都大于 0 才启用；
   * - 任一阈值被设为 0，表示禁用该能力，保持“首条消息立即执行”。
   */
  private isBurstMergeEnabled(): boolean {
    return this.config.mergeDebounceMs > 0 && this.config.mergeMaxWaitMs > 0;
  }

  /**
   * 等待一小段时间，让同 lane 的连续消息尽量在一次 run 前合并。
   *
   * 关键点（中文）
   * - 防抖窗口：`mergeDebounceMs`（期间若有新消息则续期）
   * - 最长等待：`mergeMaxWaitMs`（防止无限等待）
   */
  private async collectInitialBurstItems(
    laneKey: string,
    first: ChatQueueItem,
  ): Promise<ChatQueueItem[]> {
    if (first.kind !== "exec") return [first];
    if (!this.isBurstMergeEnabled()) return [first];

    const startedAt = Date.now();
    let lastInboundAt = startedAt;
    let knownLaneSize = getChatQueueLaneSize(laneKey);

    while (true) {
      const now = Date.now();
      const idleMs = now - lastInboundAt;
      const elapsedMs = now - startedAt;
      if (idleMs >= this.config.mergeDebounceMs) break;
      if (elapsedMs >= this.config.mergeMaxWaitMs) break;

      const remainingDebounceMs = this.config.mergeDebounceMs - idleMs;
      const remainingMaxWaitMs = this.config.mergeMaxWaitMs - elapsedMs;
      const sleepMs = Math.max(
        1,
        Math.min(
          BURST_MERGE_POLL_INTERVAL_MS,
          remainingDebounceMs,
          remainingMaxWaitMs,
        ),
      );

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, sleepMs);
        if (typeof timer.unref === "function") timer.unref();
      });

      const laneSize = getChatQueueLaneSize(laneKey);
      if (laneSize > knownLaneSize) {
        knownLaneSize = laneSize;
        lastInboundAt = Date.now();
      }
    }

    const drained = drainChatQueueLane(laneKey);
    return drained.length > 0 ? [first, ...drained] : [first];
  }

  private shouldAppendContextMessage(item: ChatQueueItem): boolean {
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

  private async appendContextMessageIfNeeded(item: ChatQueueItem): Promise<void> {
    if (!this.shouldAppendContextMessage(item)) return;
    if (item.contextPersisted === true) return;
    await this.requireContext().appendUserMessage({
      sessionId: item.contextId,
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
   * - 支持 frontmatter metadata 协议：`reply/react`。
   * - direct metadata 不支持 delay/time；定时或延迟请走 `city chat send`。
   * - 附件能力保留 `<file>` 标签，并交给渠道出站阶段统一解析。
   * - 仅消费用户可见文本与控制协议，不转发工具日志/结构化输出。
   * - 发送失败只记录 warning，不中断主执行流程。
   */
  private async dispatchAssistantTextDirect(params: {
    contextId: string;
    assistantText: string;
    phase?: "step" | "final" | "error";
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
      const target = await resolveChatReplyTarget({
        runtime: this.runtime,
        chatKey: plan.text.chatKey,
      });
      const preparedText = await prepareChatReplyText({
        runtime: this.runtime,
        input: {
          chatKey: plan.text.chatKey,
          ...(target.channel ? { channel: target.channel } : {}),
          ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
          ...(typeof plan.text.messageId === "string"
            ? { messageId: plan.text.messageId }
            : typeof target.messageId === "string"
              ? { messageId: target.messageId }
              : {}),
          text: plan.text.text,
          phase: params.phase || "final",
          mode: "direct",
        },
      });
      const textResult = await sendChatTextByChatKey({
        context: this.runtime,
        chatKey: plan.text.chatKey,
        text: preparedText,
        replyToMessage: plan.text.replyToMessage,
        messageId: plan.text.messageId,
        ...(typeof plan.text.delayMs === "number"
          ? { delayMs: plan.text.delayMs }
          : {}),
        ...(typeof plan.text.sendAtMs === "number"
          ? { sendAtMs: plan.text.sendAtMs }
          : {}),
      });
      await emitChatReplyEffect({
        runtime: this.runtime,
        input: {
          chatKey: plan.text.chatKey,
          ...(target.channel ? { channel: target.channel } : {}),
          ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
          ...(typeof plan.text.messageId === "string"
            ? { messageId: plan.text.messageId }
            : typeof target.messageId === "string"
              ? { messageId: target.messageId }
              : {}),
          text: preparedText,
          phase: params.phase || "final",
          mode: "direct",
          success: textResult.success,
          ...(textResult.success ? {} : { error: textResult.error || "chat send failed" }),
        },
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
      phase: "final",
    });
  }

  /**
   * 无论 chat method（direct/cmd），都强制把文本回发到 channel。
   *
   * 关键点（中文）
   * - 错误兜底不能依赖模型再次调用 `chat_send`。
   * - 直接按 chatKey 分发，确保失败信息可见。
   */
  private async dispatchTextToChannel(params: {
    contextId: string;
    text: string;
    messageId?: string;
    phase?: "step" | "final" | "error";
  }): Promise<boolean> {
    const text = String(params.text || "").trim();
    if (!text) return false;
    const target = await resolveChatReplyTarget({
      runtime: this.runtime,
      chatKey: params.contextId,
    });
    const preparedText = await prepareChatReplyText({
      runtime: this.runtime,
      input: {
        chatKey: params.contextId,
        ...(target.channel ? { channel: target.channel } : {}),
        ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
        ...(typeof params.messageId === "string"
          ? { messageId: params.messageId }
          : typeof target.messageId === "string"
            ? { messageId: target.messageId }
            : {}),
        text,
        phase: params.phase || "final",
        mode: "fallback",
      },
    });

    const result = await sendChatTextByChatKey({
      context: this.runtime,
      chatKey: params.contextId,
      text: preparedText,
      // 关键点（中文）：优先以 reply 形式返回到触发消息，增强用户感知。
      replyToMessage: true,
      ...(typeof params.messageId === "string" && params.messageId
        ? { messageId: params.messageId }
        : {}),
    });
    await emitChatReplyEffect({
      runtime: this.runtime,
      input: {
        chatKey: params.contextId,
        ...(target.channel ? { channel: target.channel } : {}),
        ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
        ...(typeof params.messageId === "string"
          ? { messageId: params.messageId }
          : typeof target.messageId === "string"
            ? { messageId: target.messageId }
            : {}),
        text: preparedText,
        phase: params.phase || "final",
        mode: "fallback",
        success: result.success,
        ...(result.success ? {} : { error: result.error || "chat send failed" }),
      },
    });

    if (!result.success) {
      this.logger.warn("ChatQueueWorker forced channel dispatch failed", {
        contextId: params.contextId,
        error: result.error || "chat send failed",
      });
      return false;
    }
    return true;
  }

  private async processOne(laneKey: string, first: ChatQueueItem): Promise<void> {
    if (first.kind === "control") {
      this.handleControl(first);
      return;
    }

    if (first.kind === "audit") {
      await this.appendContextMessageIfNeeded(first);
      return;
    }

    const serviceContext = this.requireContext();
    let runItem = first;

    let clearRequested = false;
    const initialBurstItems = await this.collectInitialBurstItems(laneKey, first);
    for (const item of initialBurstItems) {
      if (item.kind === "control") {
        if (item.control?.type === "clear") clearRequested = true;
        continue;
      }
      await this.appendContextMessageIfNeeded(item);
      if (item.kind === "exec") {
        runItem = item;
      }
    }

    const onStepCallback = async (): Promise<ShipContextUserMessageV1[]> => {
      const drainedItems = drainChatQueueLane(laneKey);
      if (drainedItems.length === 0) return [];
      const mergedExecMessages: ShipContextUserMessageV1[] = [];
      for (const item of drainedItems) {
        if (item.kind === "control") {
          if (item.control?.type === "clear") clearRequested = true;
          continue;
        }

        await this.appendContextMessageIfNeeded(item);
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
    let lastDirectDispatchedStepText = "";
    const onAssistantStepCallback = async (params: {
      text: string;
      stepIndex: number;
    }): Promise<void> => {
      const stepText = String(params.text || "").trim();
      if (!stepText) return;
      const dispatched = await this.dispatchAssistantTextDirect({
        contextId: runItem.contextId,
        assistantText: stepText,
        phase: "step",
      });
      // 关键点（中文）：记录最近一次已发送的 step 文本，避免最终消息重复回发。
      if (dispatched) {
        lastDirectDispatchedStepText = stepText;
      }
    };

    const typing = this.startTypingHeartbeat(runItem);
    let result: AgentResult;
    try {
      result = await serviceContext.run({
        sessionId: runItem.contextId,
        query: runItem.text,
        onStepCallback,
        onAssistantStepCallback,
      });
    } catch (error) {
      const channelErrorText = buildChannelErrorText(error);
      this.logger.error("ChatQueueWorker execution failed", {
        contextId: runItem.contextId,
        error: String(error),
      });

      try {
        await serviceContext.appendAssistantMessage({
          sessionId: runItem.contextId,
          fallbackText: channelErrorText,
          extra: {
            note: "chat_queue_worker_run_failed",
          },
        });
      } catch {
        // ignore
      }

      await this.dispatchTextToChannel({
        contextId: runItem.contextId,
        text: channelErrorText,
        messageId: runItem.messageId,
        phase: "error",
      });
      return;
    } finally {
      typing.stop();
    }

    if (clearRequested) {
      serviceContext.clearAgent(runItem.contextId);
      clearChatQueueLane(runItem.contextId);
    }

    try {
      if (!hasPersistedAssistantSteps(result.assistantMessage)) {
        await serviceContext.appendAssistantMessage({
          sessionId: runItem.contextId,
          message: result.assistantMessage,
        });
      }
      const deferredInjectedMessages = drainDeferredPersistedUserMessages(
        runItem.contextId,
      );
      for (const message of deferredInjectedMessages) {
        await serviceContext.appendUserMessage({
          sessionId: runItem.contextId,
          message,
        });
      }
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
        : await this.dispatchAssistantMessageDirect({
            contextId: runItem.contextId,
            assistantMessage: result.assistantMessage,
          });
      // 关键点（中文）：在 cmd 模式下 direct 分发会返回 false，这里无论成功/失败都强制兜底回发。
      if (!dispatchedDirect && finalChannelText) {
        await this.dispatchTextToChannel({
          contextId: runItem.contextId,
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
