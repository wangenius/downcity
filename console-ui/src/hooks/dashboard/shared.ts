/**
 * Console Dashboard 纯工具函数。
 *
 * 关键点（中文）
 * - 只保留无副作用的纯函数与常量。
 * - 供 `useConsoleDashboard` 和后续拆分子 hook 复用。
 */

import type {
  UiChatHistoryEvent,
  UiContextTimelineMessage,
  UiPluginRuntimeItem,
} from "../../types/Dashboard";

export const CONSOLEUI_CONTEXT_ID = "consoleui-chat-main";

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isNoRunningAgentError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    message.includes("no running agent found") ||
    message.includes("start one via `city agent start` first") ||
    message.includes("no running agent selected")
  );
}

export function isAgentUnavailableError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    isNoRunningAgentError(message) ||
    message.includes("service unavailable") ||
    message.includes("selected agent runtime endpoint is unavailable") ||
    message.includes("503")
  );
}

export function isChatServiceNotReadyError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    (message.includes("service") && message.includes("chat") && message.includes("未启动")) ||
    (message.includes("service") && message.includes("chat") && message.includes("not started")) ||
    (message.includes("service") && message.includes("chat") && message.includes("not start")) ||
    (message.includes("chat") && message.includes("not running"))
  );
}

export function isServiceNotRunningError(
  messageInput: string,
  serviceName: string,
): boolean {
  const message = String(messageInput || "").toLowerCase();
  const name = String(serviceName || "").trim().toLowerCase();
  if (!name) return message.includes("is not running");
  return message.includes(`service \"${name}\" is not running`) || (
    message.includes("is not running") && message.includes(name)
  );
}

export function isNotFoundError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return message.includes("404") || message.includes("not found");
}

export function statusBadgeVariant(raw?: string): "ok" | "warn" | "bad" {
  const value = String(raw || "").toLowerCase();
  if (["running", "ok", "active", "enabled", "success"].includes(value)) return "ok";
  if (["stopped", "disabled", "paused", "error", "failed", "offline"].includes(value)) return "bad";
  return "warn";
}

export function formatTime(ts?: number | string): string {
  if (ts === undefined || ts === null) return "-";
  const value = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(value) || Number.isNaN(value)) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function normalizePluginState(item: UiPluginRuntimeItem): string {
  const enabled = item.availability?.enabled === true;
  const available = item.availability?.available === true;
  if (!enabled) return "disabled";
  if (available) return "available";
  return "unavailable";
}

export function normalizePluginRuntimeItems(
  items: UiPluginRuntimeItem[],
): UiPluginRuntimeItem[] {
  return items.map((item) => {
    const reasons = Array.isArray(item.availability?.reasons)
      ? item.availability?.reasons
      : [];
    return {
      ...item,
      state: normalizePluginState(item),
      lastError: reasons.length > 0 ? reasons.join("; ") : "",
    };
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function isConsoleUiContext(contextIdInput: string): boolean {
  const contextId = String(contextIdInput || "").trim().toLowerCase();
  if (!contextId) return false;
  return contextId.startsWith("consoleui-") || contextId === "local_ui";
}

export function toHistoryEventsFromTimeline(
  contextId: string,
  timeline: UiContextTimelineMessage[],
): UiChatHistoryEvent[] {
  return timeline.map((item, index) => {
    const role = String(item.role || "").trim().toLowerCase();
    const tsRaw = item.ts;
    const tsNumber =
      typeof tsRaw === "number"
        ? tsRaw
        : Number.isFinite(Date.parse(String(tsRaw || "")))
          ? Date.parse(String(tsRaw || ""))
          : Date.now();
    return {
      id: String(item.id || `${contextId}:timeline:${index}`),
      contextId,
      channel: "consoleui",
      direction: role === "user" ? "inbound" : "outbound",
      ts: tsNumber,
      text: String(item.text || ""),
      ...(role === "user" ? { actorName: "user" } : { actorName: "agent" }),
    };
  });
}
