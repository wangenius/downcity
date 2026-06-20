/**
 * 流式会话事件控制器。
 *
 * 关键点（中文）
 * - 把 @downcity/agent 的 AgentSessionEvent 映射为消息流条目。
 * - 维护当前 turn id，保证跨事件状态一致。
 * - 所有状态变更最终反映到 MessageListComponent。
 */

import type { AgentSessionEvent } from "@downcity/agent";

import type { MessageListComponent } from "@/city/agent/tui/components/MessageList.js";
import { STREAMING_UI_FLUSH_MS } from "@/city/agent/tui/constant/streaming.js";
import { generateTuiId } from "@/city/agent/tui/utils/id.js";
import type { TranscriptEntry } from "@/city/agent/tui/types.js";

/**
 * StreamingUIController 构造选项。
 */
export interface StreamingUIOptions {
  /** 消息流组件。 */
  message_list: MessageListComponent;
  /** TUI 请求重绘回调。流式 delta、tool 事件、结束都会调用。 */
  request_render: () => void;
}

/**
 * 流式 UI 控制器。
 */
export class StreamingUIController {
  private message_list: MessageListComponent;
  private request_render_fn: () => void;
  private active_turn_id = "";
  private current_assistant_entry_id = "";
  private current_assistant_text = "";
  private flush_timer: ReturnType<typeof setTimeout> | null = null;
  private last_flush_at = 0;
  private pending_render = false;

  /**
   * @param options 构造选项。
   */
  constructor(options: StreamingUIOptions) {
    this.message_list = options.message_list;
    this.request_render_fn = options.request_render;
  }

  /**
   * 启动新一轮渲染。
   */
  start_turn(): void {
    this.active_turn_id = "";
    this.current_assistant_entry_id = "";
    this.current_assistant_text = "";
    this.pending_render = false;
    this.clear_flush_timer();
  }

  /**
   * 绑定当前 turn id。
   *
   * @param turn_id turn id。
   */
  attach_turn_id(turn_id: string): void {
    this.active_turn_id = String(turn_id || "").trim();
  }

  /**
   * 处理单个 session 事件。
   *
   * @param event AgentSessionEvent。
   */
  handle_event(event: AgentSessionEvent): void {
    const event_turn_id = this.extract_event_turn_id(event);
    if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
      return;
    }

   switch (event.type) {
      case "turn-start":
        this.attach_turn_id(event.turnId);
        // 关键点（中文）：对齐 Kimi Code，不在 turn-start 预创建 assistant entry。
        // 第一个 text-delta 到达时才创建，保证 entry 位置与文本实际出现位置一致。
        break;
      case "text-delta":
        this.append_assistant_text(event.text || "");
        break;
      case "tool-call":
        // 关键点（中文）：tool 开始前先 finalize 当前 assistant text，
        // 让后续 text 在 tool result 之后创建新 entry。
        this.finalize_assistant();
        this.add_tool_call(event.toolName, event.args);
        break;
      case "tool-result":
        this.add_tool_result(event.toolName, event.result);
        break;
      case "tool-approval-request":
        // 关键点（中文）：approval 也是交互断点，先结束当前 assistant text。
        this.finalize_assistant();
        this.add_approval_request(event);
        break;
      case "tool-approval-result":
        this.add_approval_result(event);
        break;
      case "reasoning-delta":
        // reasoning 不在 TUI 中直接展示，只保证状态为 thinking。
        break;
      case "error":
        this.add_error(event.message || "unknown error");
        break;
      case "turn-finish":
        this.finalize_assistant();
        break;
      case "assistant-step":
        // 关键点（中文）：每个 assistant step 结束都是文本断点，
        // finalize 后下一个 text-delta 会创建新 entry。
        this.finalize_assistant();
        break;
      case "session-title":
      default:
        break;
    }
  }

  /**
   * 结束当前一轮渲染。
   */
  finish_turn(): void {
    this.finalize_assistant();
    this.flush_now();
  }

  private extract_event_turn_id(event: AgentSessionEvent): string {
    if (event.type === "tool-approval-request" || event.type === "tool-approval-result") {
      return "";
    }
    if ("turnId" in event && typeof event.turnId === "string") {
      return event.turnId;
    }
    return "";
  }

  private create_assistant_entry(): void {
    const id = generateTuiId();
    this.current_assistant_entry_id = id;
    this.current_assistant_text = "";
    const entry: TranscriptEntry = {
      id,
      kind: "assistant",
      text: "",
      streaming: true,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  private append_assistant_text(delta: string): void {
    if (!this.current_assistant_entry_id) {
      this.create_assistant_entry();
    }
    this.current_assistant_text += delta;
    this.message_list.update_assistant_text(
      this.current_assistant_entry_id,
      this.current_assistant_text,
      true,
    );
    this.schedule_render();
  }

  private finalize_assistant(): void {
    if (!this.current_assistant_entry_id) {
      return;
    }
    this.message_list.update_assistant_text(
      this.current_assistant_entry_id,
      this.current_assistant_text,
      false,
    );
    this.current_assistant_entry_id = "";
    this.current_assistant_text = "";
    this.schedule_render();
  }

  private add_tool_call(tool_name: string, args: unknown): void {
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "tool-call",
      tool_name,
      args,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  private add_tool_result(tool_name: string, result: unknown): void {
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "tool-result",
      tool_name,
      result,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  private add_approval_request(
    event: Extract<AgentSessionEvent, { type: "tool-approval-request" }>,
  ): void {
    const operation = event.operation || (event.toolName === "shell_write" ? "write" : "exec");
    const command_value =
      operation === "write" ? event.inputPreview || event.cmd : event.cmd;
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "tool-approval-request",
      approval_id: event.approvalId,
      tool_name: event.toolName,
      operation,
      command_value,
      cwd: event.cwd,
      reason: event.reason,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  private add_approval_result(
    event: Extract<AgentSessionEvent, { type: "tool-approval-result" }>,
  ): void {
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "tool-approval-result",
      approval_id: event.approvalId,
      tool_name: event.toolName,
      decision: event.decision,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  private add_error(text: string): void {
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "error",
      text,
      created_at: Date.now(),
    };
    this.message_list.add_entry(entry);
    this.schedule_render();
  }

  /**
   * 调度一次重绘。多次调用会被合并到下一个 STREAMING_UI_FLUSH_MS 节拍。
   */
  private schedule_render(): void {
    this.pending_render = true;
    if (this.flush_timer !== null) {
      return;
    }
    const elapsed = Date.now() - this.last_flush_at;
    const delay = elapsed >= STREAMING_UI_FLUSH_MS ? 0 : STREAMING_UI_FLUSH_MS - elapsed;
    this.flush_timer = setTimeout(() => {
      this.flush_timer = null;
      this.flush_now();
    }, delay);
  }

  /**
   * 立刻触发一次重绘，并重置节流计时。
   */
  private flush_now(): void {
    this.clear_flush_timer();
    if (!this.pending_render) {
      return;
    }
    this.pending_render = false;
    this.last_flush_at = Date.now();
    this.request_render_fn();
  }

  private clear_flush_timer(): void {
    if (this.flush_timer === null) {
      return;
    }
    clearTimeout(this.flush_timer);
    this.flush_timer = null;
  }
}
