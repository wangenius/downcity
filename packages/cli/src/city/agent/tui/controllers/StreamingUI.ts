/**
 * 流式会话事件控制器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code StreamingUIController 的语义方法：
 *   appendAssistantDelta / onStreamingTextStart / onStreamingTextUpdate / onStreamingTextEnd。
 * - 用 _streaming_block 维护当前 assistant 条目，保证增量只更新同一个组件。
 * - flush 节拍合并高频 text-delta，降低终端重绘开销。
 */

import type { SessionMessageMutation } from "@downcity/agent";

import { AssistantMessageComponent } from "@/city/agent/tui/components/AssistantMessage.js";
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

interface StreamingBlock {
  /** assistant 条目 ID。 */
  entry_id: string;
  /** assistant 渲染组件。 */
  component: AssistantMessageComponent;
}

/**
 * 流式 UI 控制器。
 */
export class StreamingUIController {
  private message_list: MessageListComponent;
  private request_render_fn: () => void;
  private active_turn_id = "";
  private streaming_block: StreamingBlock | null = null;
  private assistant_draft = "";
  private pending_assistant_flush = false;
  private flush_timer: ReturnType<typeof setTimeout> | null = null;
  private last_flush_at = 0;
  private pending_render = false;
  private readonly tool_call_ids = new Set<string>();

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
    this.on_streaming_text_end();
    this.assistant_draft = "";
    this.pending_assistant_flush = false;
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
  handle_event(event: SessionMessageMutation): void {
    const event_turn_id = event.turn_id || "";
    if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
      return;
    }

    switch (event.type) {
      case "assistant-part-delta":
        if (event.part_type === "text") this.append_assistant_delta(event.delta);
        break;
      case "assistant-part-updated":
        if (event.part.type !== "tool") break;
        this.finalize_assistant();
        if (!this.tool_call_ids.has(event.part.tool_call_id)) {
          this.tool_call_ids.add(event.part.tool_call_id);
          this.add_tool_call(
            event.part.tool_name,
            event.part.tool_call_id,
            event.part.input || {},
          );
        }
        if (event.part.state === "completed") {
          this.message_list.update_tool_result(
            event.part.tool_call_id,
            event.part.output,
          );
        }
        if (event.part.state === "failed") {
          this.message_list.update_tool_result(
            event.part.tool_call_id,
            event.part.error || "Tool failed",
          );
        }
        break;
      case "message-created":
        if (event.message.type === "error") this.add_error(event.message.message);
        break;
      case "message-completed":
        this.finalize_assistant();
        break;
      case "message-updated":
      default:
        break;
    }
  }

  /**
   * 结束当前一轮渲染。
   */
  finish_turn(): void {
    this.finalize_assistant();
    this.flush();
  }

  /**
   * 追加 assistant 文本增量。
   *
   * @param delta 新增文本片段。
   */
  private append_assistant_delta(delta: string): void {
    if (this.streaming_block === null) {
      this.on_streaming_text_start();
    }
    this.assistant_draft += delta;
    this.pending_assistant_flush = true;
    this.schedule_render();
  }

  /**
   * 开始一个新的 assistant 流式条目。
   */
  private on_streaming_text_start(): void {
    const entry_id = generateTuiId();
    const entry: TranscriptEntry = {
      id: entry_id,
      kind: "assistant",
      text: "",
      streaming: true,
      created_at: Date.now(),
    };
    const component = new AssistantMessageComponent();
    this.message_list.add_entry(entry);
    this.streaming_block = { entry_id, component };
  }

  /**
   * 将当前 draft 刷入组件与条目。
   */
  private flush(): void {
    this.clear_flush_timer();
    if (!this.pending_assistant_flush) {
      return;
    }
    this.pending_assistant_flush = false;
    this.last_flush_at = Date.now();

    if (this.streaming_block !== null) {
      this.streaming_block.component.update_content(this.assistant_draft);
      this.message_list.update_assistant_text(
        this.streaming_block.entry_id,
        this.assistant_draft,
        true,
      );
    }

    if (this.pending_render) {
      this.pending_render = false;
      this.request_render_fn();
    }
  }

  /**
   * 结束当前 assistant 流式条目。
   */
  private on_streaming_text_end(): void {
    if (this.streaming_block === null) {
      return;
    }
    const { entry_id } = this.streaming_block;
    this.message_list.update_assistant_text(entry_id, this.assistant_draft, false);
    this.streaming_block = null;
    this.assistant_draft = "";
    this.pending_assistant_flush = false;
  }

  /**
   * 结束当前 assistant 文本块。
   */
  private finalize_assistant(): void {
    this.flush();
    this.on_streaming_text_end();
    this.schedule_render();
  }

  private add_tool_call(tool_name: string, tool_call_id: string, args: unknown): void {
    const entry: TranscriptEntry = {
      id: generateTuiId(),
      kind: "tool-call",
      tool_call_id,
      tool_name,
      args,
      status: "pending",
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
      this.flush();
    }, delay);
  }

  private clear_flush_timer(): void {
    if (this.flush_timer === null) {
      return;
    }
    clearTimeout(this.flush_timer);
    this.flush_timer = null;
  }
}
