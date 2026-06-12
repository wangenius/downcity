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
import type {
  AgentChatSessionChoice,
  AgentChatSessionSummaryView,
} from "./AgentChatTypes.js";
import {
  resolve_loop_selectable_index,
  resolve_next_loop_selectable_index,
} from "../tui/SelectableList.js";

interface blessed_log_element extends blessed.Widgets.BoxElement {
  setLabel: (label: string) => void;
  setContent: (content: string) => void;
  setScrollPerc?: (value: number) => void;
}

interface blessed_textbox_element extends blessed.Widgets.TextboxElement {
  /** 绑定键盘事件。 */
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_textbox_element;
  /** 聚焦输入框。 */
  focus: () => void;
  /** 进入 blessed 输入读取状态。 */
  readInput: (callback: (error: Error | null, value?: string) => void) => void;
  /** blessed readInput 内部结束回调，用于兼容部分终端回车不触发 submit 的情况。 */
  _done?: (error: Error | string | null, value?: string | null) => void;
  /** 提交当前输入内容。 */
  submit: () => void;
  /** 读取当前输入内容。 */
  getValue: () => string;
  /** 清空当前输入内容。 */
  clearValue: () => void;
}

interface blessed_list_element extends blessed.Widgets.ListElement {
  /** 绑定键盘事件。 */
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  /** 绑定元素事件。 */
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  /** 聚焦列表。 */
  focus: () => void;
  /** 选中指定索引。 */
  select: (index: number) => void;
  /** 当前选中索引。 */
  selected?: number;
}

function extract_event_turn_id(event: AgentSessionEvent): string {
  if (event.type === "tool-approval-request" || event.type === "tool-approval-result") {
    return "";
  }
  if ("turnId" in event && typeof event.turnId === "string") {
    return event.turnId;
  }
  return "";
}

function format_approval_request_block(event: Extract<AgentSessionEvent, { type: "tool-approval-request" }>): {
  title: string;
  detail_lines: string[];
} {
  const operation = event.operation || (event.toolName === "shell_write" ? "write" : "exec");
  const command_label = operation === "write" ? "input_preview" : "cmd";
  const command_value = operation === "write" ? event.inputPreview || event.cmd : event.cmd;
  return {
    title: `[approval] ${event.toolName} requests unrestricted sandbox`,
    detail_lines: [
      `approval_id: ${event.approvalId}`,
      `operation: ${operation}`,
      ...(event.shellId ? [`shell_id: ${event.shellId}`] : []),
      `${command_label}: ${command_value}`,
      ...(typeof event.inputChars === "number" ? [`input_chars: ${event.inputChars}`] : []),
      `cwd: ${event.cwd}`,
      `reason: ${event.reason}`,
    ],
  };
}

function format_approval_result_block(event: Extract<AgentSessionEvent, { type: "tool-approval-result" }>): {
  title: string;
  detail_lines: string[];
} {
  return {
    title: `[approval] ${event.decision}`,
    detail_lines: [
      `approval_id: ${event.approvalId}`,
      `tool: ${event.toolName}`,
    ],
  };
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
      case "tool-approval-request":
        this.flush_stream();
        this.push_tool_block(format_approval_request_block(typed_event));
        return;
      case "tool-approval-result":
        this.flush_stream();
        this.push_tool_block(format_approval_result_block(typed_event));
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
  session_id: string;
  list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
  create_session: () => Promise<{ session_id: string }>;
  run_turn: (input: {
    session_id: string;
    message: string;
    interactive_renderer: AgentChatInteractiveRendererPort;
  }) => Promise<{
    success: boolean;
    error?: string;
    emitted_visible_text: boolean;
    text?: string;
  }>;
}): Promise<void> {
  let current_session_id = params.session_id;
  const build_title = (): string =>
    `Agent chat · ${params.agent_id} · ${current_session_id}`;
  const history_lines: string[] = [
    `system> ${build_title()}`,
    "system> Type /help for shortcuts, /session to switch, /new to create, /quit to exit.",
  ];

  await new Promise<void>((resolve) => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: build_title(),
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
      label: ` ${build_title()} `,
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
      // 关键点（中文）：这里必须手动调用 readInput(callback)。
      // inputOnFocus 会在 focus 时先触发无 callback 的 readInput，导致后续 Enter 无法交给聊天循环。
      inputOnFocus: false,
      keys: true,
      mouse: true,
      border: "line",
      label: " Message ",
      style: {
        border: { fg: "green" },
        fg: "white",
        bg: "black",
      },
    }) as blessed_textbox_element;

    const refresh_view = (stream_preview: string = ""): void => {
      const title = build_title();
      screen.title = title;
      log_box.setLabel(` ${title} `);
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

    const reset_session_view = (session_id: string): void => {
      current_session_id = session_id;
      history_lines.splice(
        0,
        history_lines.length,
        `system> ${build_title()}`,
        "system> Type /help for shortcuts, /session to switch, /new to create, /quit to exit.",
      );
      refresh_view();
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
        let finished_input = false;
        let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;
        const cleanup_input = (): void => {
          if (raw_input_listener) {
            process.stdin.off("data", raw_input_listener);
            raw_input_listener = undefined;
          }
        };
        const finish_input = (value: string | undefined): void => {
          if (finished_input) return;
          finished_input = true;
          cleanup_input();
          if (active_input_resolver === finish_input) {
            active_input_resolver = null;
          }
          resolve_input(value);
        };

        active_input_resolver = finish_input;
        input_box.readInput((error, value) => {
          if (error) {
            finish_input(undefined);
            return;
          }
          finish_input(normalize_textbox_value(value));
        });
        input_box.key(["enter", "return"], () => {
          // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
          input_box.submit();
        });
        input_box.key(["escape", "C-c"], () => finish_input(undefined));
        input_box.key(["C-u"], () => {
          input_box.clearValue();
          screen.render();
        });
        raw_input_listener = (chunk: Buffer | string): void => {
          const text = String(chunk);
          if (text.includes("\u0003") || is_plain_escape_input(text)) {
            finish_input(undefined);
            return;
          }
          if (text.includes("\u0015")) {
            input_box.clearValue();
            screen.render();
            return;
          }
          if (text.includes("\r") || text.includes("\n")) {
            // 关键点（中文）：部分终端的回车不会触发 blessed 的 enter/return，延后一拍读取最新值。
            setImmediate(() => submit_textbox_value(input_box, () => {
              finish_input(normalize_textbox_value(input_box.getValue()));
            }));
          }
        };
        process.stdin.on("data", raw_input_listener);
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
          history_lines.splice(0, history_lines.length, `system> ${build_title()}`);
          refresh_view();
          continue;
        }
        if (text === "/help") {
          history_lines.push("system> /help · /session · /new · /clear · /quit");
          refresh_view();
          continue;
        }
        if (text === "/new") {
          history_lines.push("status> Creating session...");
          refresh_view();
          try {
            const created = await params.create_session();
            reset_session_view(created.session_id);
          } catch (error) {
            history_lines.push(`error> ${format_error_message(error)}`);
            refresh_view();
          }
          continue;
        }
        if (text === "/session") {
          const choice = await open_session_picker({
            screen,
            list_sessions: params.list_sessions,
          });
          if (!choice) {
            refresh_view();
            continue;
          }
          if (choice.kind === "create") {
            history_lines.push("status> Creating session...");
            refresh_view();
            try {
              const created = await params.create_session();
              reset_session_view(created.session_id);
            } catch (error) {
              history_lines.push(`error> ${format_error_message(error)}`);
              refresh_view();
            }
            continue;
          }
          if (choice.sessionId) {
            reset_session_view(choice.sessionId);
          }
          continue;
        }

        history_lines.push(`user> ${text}`);
        const renderer = new AgentChatTuiRenderer({
          history_lines,
          refresh_view: () => refresh_view(renderer.get_stream_preview()),
        });
        refresh_view();

        const outcome = await params.run_turn({
          session_id: current_session_id,
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

async function open_session_picker(params: {
  screen: blessed.Widgets.Screen;
  list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
}): Promise<AgentChatSessionChoice | null> {
  const sessions = await params.list_sessions();
  const choices: AgentChatSessionChoice[] = [
    { kind: "create" },
    ...sessions.map((session) => ({
      kind: "session" as const,
      sessionId: session.sessionId,
    })),
  ];
  const labels = [
    "+ Create new session",
    ...sessions.map(format_session_choice_label),
  ];

  return await new Promise<AgentChatSessionChoice | null>((resolve) => {
    const overlay = blessed.box({
      parent: params.screen,
      top: "center",
      left: "center",
      width: "80%",
      height: "70%",
      border: "line",
      label: " Sessions ",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      style: {
        border: { fg: "green" },
        fg: "white",
        bg: "black",
      },
    });
    const list = blessed.list({
      parent: overlay,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      keys: false,
      vi: false,
      mouse: true,
      items: labels,
      style: {
        selected: {
          fg: "black",
          bg: "green",
        },
        item: {
          fg: "white",
        },
      },
    }) as blessed_list_element;

    let finished = false;
    let selected_index = resolve_loop_selectable_index(choices, 0, 0);
    const finish = (choice: AgentChatSessionChoice | null): void => {
      if (finished) return;
      finished = true;
      overlay.destroy();
      params.screen.render();
      resolve(choice);
    };

    list.key(["escape", "C-c", "q"], () => finish(null));
    list.key(["up", "k"], () => {
      selected_index = resolve_next_loop_selectable_index(
        choices,
        selected_index,
        -1,
      );
      list.select(selected_index);
      params.screen.render();
    });
    list.key(["down", "j"], () => {
      selected_index = resolve_next_loop_selectable_index(
        choices,
        selected_index,
        1,
      );
      list.select(selected_index);
      params.screen.render();
    });
    list.key(["enter", "return"], () => {
      selected_index = resolve_loop_selectable_index(
        choices,
        list.selected,
        selected_index,
      );
      finish(choices[selected_index] || null);
    });
    list.on("select", (_item, index) => {
      selected_index = resolve_loop_selectable_index(
        choices,
        index,
        selected_index,
      );
      finish(choices[selected_index] || null);
    });
    list.select(selected_index);
    list.focus();
    params.screen.render();
  });
}

function format_session_choice_label(session: AgentChatSessionSummaryView): string {
  const title = String(session.title || session.sessionId).trim();
  const count = `${session.messageCount} msg`;
  const executing = session.executing ? " · running" : "";
  const preview = String(session.previewText || "").trim();
  return preview
    ? `${title} · ${count}${executing} · ${preview}`
    : `${title} · ${count}${executing}`;
}

function format_error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalize_textbox_value(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}

function submit_textbox_value(
  textbox: blessed_textbox_element,
  finish: () => void,
): void {
  if (textbox._done) {
    // 关键点（中文）：stop 只释放 blessed 内部 readInput 状态，不触发 submit/cancel 回调。
    textbox._done("stop");
  }
  finish();
}

function is_plain_escape_input(text: string): boolean {
  return text === "\u001b";
}
