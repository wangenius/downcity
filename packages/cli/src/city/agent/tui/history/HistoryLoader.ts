/**
 * Agent Chat TUI 历史记录加载器。
 *
 * 关键点（中文）
 * - 把远程 session 的 timeline 视图事件映射为 TUI 可渲染的 TranscriptEntry。
 * - 负责 tool-call / tool-result 的相邻配对，以及 action 事件的可读化。
 * - 纯函数，不依赖 pi-tui 实例，便于单元测试。
 */

import type { AgentSessionTimelineEvent } from "@downcity/agent";
import type { ToolCallEntry, TranscriptEntry } from "@/city/agent/tui/types.js";

/**
 * 将 timeline 事件列表转换为 transcript 条目列表。
 *
 * 关键点（中文）
 * - 按时间线顺序逐个处理，遇到 user / assistant 时先收尾 pending 的 tool-call。
 * - tool-result 会尝试合并到前一条未闭合的 tool-call；无匹配时降级为 status 提示。
 * - action 事件使用 actionTitle / actionDescription / actionState 组合展示。
 *
 * @param events 来自 `session.records({ view: "timeline" })` 的事件。
 * @returns 可直接送入 MessageList 的条目。
 */
export function timeline_events_to_entries(
  events: AgentSessionTimelineEvent[],
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let pending_tool_call: ToolCallEntry | null = null;

  for (const event of events) {
    const created_at = event.ts ?? Date.now();

    switch (event.role) {
      case "user": {
        flush_pending_tool_call(entries, pending_tool_call);
        pending_tool_call = null;
        entries.push({
          id: event.id,
          kind: "user",
          text: event.text,
          created_at,
        });
        break;
      }
      case "assistant": {
        flush_pending_tool_call(entries, pending_tool_call);
        pending_tool_call = null;
        entries.push({
          id: event.id,
          kind: "assistant",
          text: event.text,
          streaming: false,
          created_at,
        });
        break;
      }
      case "tool-call": {
        flush_pending_tool_call(entries, pending_tool_call);
        pending_tool_call = {
          id: event.id,
          kind: "tool-call",
          tool_call_id: event.id,
          tool_name: event.toolName || "tool",
          args: safe_parse_json_object(event.text),
          status: "pending",
          created_at,
        };
        break;
      }
      case "tool-result": {
        if (pending_tool_call) {
          pending_tool_call.result = event.text;
          pending_tool_call.status = "success";
          entries.push(pending_tool_call);
          pending_tool_call = null;
        } else {
          entries.push({
            id: event.id,
            kind: "status",
            text: `Tool result: ${event.text}`,
            created_at,
          });
        }
        break;
      }
      case "action": {
        flush_pending_tool_call(entries, pending_tool_call);
        pending_tool_call = null;
        const action_text = [
          event.actionTitle,
          event.actionDescription,
          event.actionState,
        ].filter(Boolean).join(" · ");
        entries.push({
          id: event.id,
          kind: "status",
          text: action_text || event.text,
          created_at,
        });
        break;
      }
      default: {
        flush_pending_tool_call(entries, pending_tool_call);
        pending_tool_call = null;
        entries.push({
          id: event.id,
          kind: "status",
          text: event.text,
          created_at,
        });
      }
    }
  }

  flush_pending_tool_call(entries, pending_tool_call);
  return entries;
}

/**
 * 将 pending 的 tool-call 刷入 entries。
 */
function flush_pending_tool_call(
  entries: TranscriptEntry[],
  pending: ToolCallEntry | null,
): void {
  if (!pending) return;
  entries.push(pending);
}

/**
 * 安全地把文本解析为对象，失败时返回空对象。
 */
function safe_parse_json_object(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 忽略解析失败，降级为空参数对象。
  }
  return {};
}
