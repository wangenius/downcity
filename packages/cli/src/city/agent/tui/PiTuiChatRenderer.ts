/**
 * 基于 pi-tui 的交互式 chat 渲染器。
 *
 * 关键点（中文）
 * - 实现 AgentChatInteractiveRendererPort，接入 AgentChat 的 runSdkPromptTurn。
 * - 把 SDK 事件转交给 StreamingUIController，驱动消息流更新。
 */

import type { SessionMutation } from "@downcity/agent";

import type {
  AgentChatInteractiveRenderSnapshot,
  AgentChatInteractiveRendererPort,
} from "@/city/types/AgentChatInteractive.js";
import { StreamingUIController } from "@/city/agent/tui/controllers/StreamingUI.js";
import type { MessageListComponent } from "@/city/agent/tui/components/MessageList.js";

/**
 * pi-tui 版交互式渲染器。
 */
export class PiTuiChatRenderer implements AgentChatInteractiveRendererPort {
  private streaming_ui: StreamingUIController;
  private emitted_visible_text = false;
  on_approval_request?: AgentChatInteractiveRendererPort["on_approval_request"];

  /**
   * @param message_list 消息流组件。
   * @param request_render 通知 TUI 重绘的回调。
   * @param on_approval_request approval 内联面板回调。
   */
  constructor(
    message_list: MessageListComponent,
    request_render: () => void,
    on_approval_request?: AgentChatInteractiveRendererPort["on_approval_request"],
  ) {
    this.streaming_ui = new StreamingUIController({
      message_list,
      request_render,
    });
    this.on_approval_request = on_approval_request;
  }

  /**
   * 启动新一轮渲染。
   */
  start_turn(): void {
    this.emitted_visible_text = false;
    this.streaming_ui.start_turn();
  }

  /**
   * 绑定当前 turn id。
   *
   * @param turn_id turn id。
   */
  attach_turn_id(turn_id: string): void {
    this.streaming_ui.attach_turn_id(turn_id);
  }

  /**
   * 渲染单个 session 事件。
   *
   * @param event Session Mutation。
   */
  render_event(event: SessionMutation): void {
    this.streaming_ui.handle_event(event);
    if (
      event.variant === "delta" &&
      event.type === "text" &&
      event.delta.trim()
    ) {
      this.emitted_visible_text = true;
    }
    if (
      event.variant === "part" &&
      event.type === "tool" &&
      event.part.state === "approval-required" &&
      event.part.approval_id
    ) {
      const approval_details = read_approval_details(event.part.input);
      this.on_approval_request?.({
        approval_id: event.part.approval_id,
        tool_name: event.part.tool_name,
        cmd: approval_details.cmd,
        cwd: approval_details.cwd,
        reason: approval_details.reason,
      });
    }
  }

  /**
   * 结束当前一轮渲染。
   *
   * @returns 渲染结果快照。
   */
  finish_turn(): AgentChatInteractiveRenderSnapshot {
    this.streaming_ui.finish_turn();
    return {
      emitted_visible_text: this.emitted_visible_text,
    };
  }
}

/** 从工具输入提取审批面板的即时回退详情。 */
function read_approval_details(input: unknown): {
  cmd: string;
  cwd: string;
  reason: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { cmd: "", cwd: "", reason: "Tool execution requires approval." };
  }
  const values = input as Record<string, unknown>;
  const cmd = first_string(values, ["cmd", "command", "input"]);
  const cwd = first_string(values, ["workdir", "cwd"]);
  const reason = first_string(values, ["reason"])
    || "Tool execution requires approval.";
  return { cmd, cwd, reason };
}

/** 从候选字段中读取第一个非空字符串。 */
function first_string(values: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
