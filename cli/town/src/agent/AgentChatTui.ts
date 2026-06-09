/**
 * `town agent chat` TUI 聊天界面。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 readline 持续对话。
 * - 顶部展示当前 agent / session，中央滚动展示消息与 tool 事件，底部输入。
 * - 只负责交互式持续对话；一次性 `--message` 仍走原有脚本化路径。
 */

import blessed from "neo-blessed";
import type { AgentSessionEvent } from "@downcity/agent";
import type {
  AgentChatInteractiveRenderSnapshot,
  AgentChatInteractiveRendererPort,
} from "../types/AgentChatInteractive.js";
import {
  format_tool_call_block,
  format_tool_result_block,
} from "./AgentChatToolFormatter.js";

interface blessed_log_element extends blessed.Widgets.BoxElement {
  setContent: (content: string) => void;
  setScrollPerc?: (value: number) => void;
}

interface chat_message_sink {
  /** 追加普通消息。 */
  append_message: (role: "system" | "user" | "assistant", text: string) => void;

  /** 追加状态消息。 */
  append_status: (text: string) => void;
}

function extract_event_turn_id(event: AgentSessionEvent): string {
  if ("turnId" in event && typeof event.turnId === "string") {
    return event.turnId;
  }
  return "";
}

/**
 * TUI 聊天渲染器。
 */
class AgentChatTuiRenderer implements AgentChatInteractiveRendererPort {
  private active_turn_id = "";
  private emitted_visible_text = false;
  private stream_text = "";
  private readonly history_lines: string[];
  private readonly refresh_view: () => void;

  constructor(params: {
    history_lines: string[];
    refresh_view: () => void;
  }) {
    this.history_lines = params.history_lines;
    this.refresh_view = params.refresh_view;
  }

  start_turn(): void {
    this.active_turn_id = "";
    this.emitted_visible_text = false;
    this.stream_text = "";
  }

  attach_turn_id(turn_id: string): void {
    this.active_turn_id = String(turn_id || "").trim();
  }

  render_event(event: unknown): void {
    const typed_event = event as AgentSessionEvent;
    const event_turn_id = extract_event_turn_id(typed_event);
    if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
      return;
    }

    switch (typed_event.type) {
      case "turn-start":
        this.attach_turn_id(typed_event.turnId);
        this.push_status("Thinking...");
        return;
      case "tool-call":
        this.flush_stream();
        this.push_tool_block(
          format_tool_call_block({
            tool_name: typed_event.toolName,
            args: typed_event.args,
          }),
        );
        return;
      case "tool-result":
        this.flush_stream();
        this.push_tool_block(
          format_tool_result_block({
            tool_name: typed_event.toolName,
            result: typed_event.result,
          }),
        );
        return;
      case "reasoning-delta":
        return;
      case "text-delta":
        this.stream_text += typed_event.text || "";
        if (this.stream_text.trim()) {
          this.emitted_visible_text = true;
        }
        this.refresh_view();
        return;
      case "turn-finish":
      case "assistant-step":
      case "session-title":
      case "error":
      default:
        return;
    }
  }

  finish_turn(): AgentChatInteractiveRenderSnapshot {
    this.flush_stream();
    this.refresh_view();
    return {
      emitted_visible_text: this.emitted_visible_text,
    };
  }

  get_stream_preview(): string {
    return this.stream_text;
  }

  private flush_stream(): void {
    const normalized_text = String(this.stream_text || "").trim();
    if (normalized_text) {
      this.history_lines.push(`assistant> ${normalized_text}`);
      this.emitted_visible_text = true;
    }
    this.stream_text = "";
  }

  private push_status(text: string): void {
    this.history_lines.push(`status> ${text}`);
    this.refresh_view();
  }

  private push_tool_block(block: {
    title: string;
    detail_lines: string[];
  }): void {
    this.history_lines.push(`tool> ${block.title}`);
    for (const detail_line of block.detail_lines) {
      this.history_lines.push(`  ${detail_line}`);
    }
    this.refresh_view();
  }
}

/**
 * 打开 TUI 聊天面板。
 */
export async function run_agent_chat_tui(params: {
  agent_id: string;
  run_turn: (input: {
    message: string;
    interactive_renderer: AgentChatInteractiveRendererPort;
  }) => Promise<{
    success: boolean;
    error?: string;
    emitted_visible_text: boolean;
    text?: string;
  }>;
}): Promise<void> {
  const history_lines: string[] = [
    `system> Agent chat · ${params.agent_id}`,
    "system> Type /help for shortcuts, /quit to exit.",
  ];

  await new Promise<void>((resolve) => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: `Agent Chat · ${params.agent_id}`,
      dockBorders: true,
      autoPadding: true,
    });

    let active_input_resolver: ((value: string | undefined) => void) | null = null;
    let closed = false;

    const log_box = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%-4",
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      border: "line",
      label: ` Agent Chat · ${params.agent_id} `,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      style: {
        border: { fg: "green" },
      },
      content: "",
    }) as blessed_log_element;

    const input_box = blessed.textbox({
      parent: screen,
      left: 0,
      bottom: 0,
      width: "100%",
      height: 4,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      border: "line",
      label: " Message ",
      style: {
        border: { fg: "green" },
        fg: "white",
        bg: "black",
      },
    });

    const refresh_view = (stream_preview: string = ""): void => {
      const content = [...history_lines];
      const normalized_stream = String(stream_preview || "").trim();
      if (normalized_stream) {
        content.push(`assistant> ${normalized_stream}`);
      }
      log_box.setContent(content.join("\n"));
      if (typeof log_box.setScrollPerc === "function") {
        log_box.setScrollPerc(100);
      }
      screen.render();
    };

    const finish = (): void => {
      if (closed) return;
      closed = true;
      if (active_input_resolver) {
        const resolver = active_input_resolver;
        active_input_resolver = null;
        resolver(undefined);
      }
      screen.destroy();
      resolve();
    };

    const read_message_once = async (): Promise<string | undefined> => {
      input_box.focus();
      input_box.clearValue();
      screen.render();

      return await new Promise<string | undefined>((resolve_input) => {
        active_input_resolver = resolve_input;
        input_box.readInput((error, value) => {
          if (active_input_resolver !== resolve_input) {
            return;
          }
          active_input_resolver = null;
          if (error) {
            resolve_input(undefined);
            return;
          }
          resolve_input(String(value ?? ""));
        });
      });
    };

    screen.key(["C-c"], () => finish());
    refresh_view();

    void (async () => {
      while (!closed) {
        const line = await read_message_once();
        if (closed || line === undefined) {
          break;
        }

        const text = String(line || "").trim();
        if (!text) {
          continue;
        }
        if (text === "/quit" || text === "/exit") {
          break;
        }
        if (text === "/clear") {
          history_lines.splice(0, history_lines.length, `system> Agent chat · ${params.agent_id}`);
          refresh_view();
          continue;
        }
        if (text === "/help") {
          history_lines.push("system> /help · /clear · /quit");
          refresh_view();
          continue;
        }

        history_lines.push(`user> ${text}`);
        const renderer = new AgentChatTuiRenderer({
          history_lines,
          refresh_view: () => refresh_view(renderer.get_stream_preview()),
        });
        refresh_view();

        const outcome = await params.run_turn({
          message: text,
          interactive_renderer: renderer,
        });
        renderer.finish_turn();
        if (!outcome.success) {
          history_lines.push(`error> ${outcome.error || "agent chat failed"}`);
        } else if (!outcome.emitted_visible_text) {
          history_lines.push("assistant> [no visible reply]");
        }
        refresh_view();
      }

      finish();
    })();
  });
}
