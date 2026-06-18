/**
 * town agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 类似 Kimi Code 的 KimiTUI，负责把状态、布局、输入、session 生命周期串起来。
 * - 不在这里积累事件路由或渲染逻辑，那些下沉到 StreamingUIController 与组件。
 */

import {
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  type Component,
  type OverlayHandle,
} from "@earendil-works/pi-tui";

import {
  ChatEditorComponent,
  MessageListComponent,
  StatusLineComponent,
} from "./components/index.js";
import { SessionPickerComponent } from "./dialogs/SessionPicker.js";
import { PiTuiChatRenderer } from "./PiTuiChatRenderer.js";
import type { AgentChatSessionSummaryView } from "../AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "../../types/AgentChatInteractive.js";
import type { AppState } from "./types.js";

/**
 * 协调器构造选项。
 */
export interface AgentChatTuiCoordinatorOptions {
  /** 目标 agent id。 */
  agent_id: string;
  /** 初始 session id。 */
  session_id: string;
  /** 列出远程 session。 */
  list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
  /** 创建新 session。 */
  create_session: () => Promise<{ session_id: string }>;
  /** 执行一轮对话。 */
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
}

/**
 * Agent chat TUI 协调器。
 */
export class AgentChatTuiCoordinator {
  private readonly options: AgentChatTuiCoordinatorOptions;
  private readonly terminal: ProcessTerminal;
  private readonly tui: TUI;
  private readonly status_line: StatusLineComponent;
  private readonly message_list: MessageListComponent;
  private readonly editor: ChatEditorComponent;
  private app_state: AppState;
  private current_session_id: string;
  private running = false;
  private stopped = false;
  private resolve_run: (() => void) | null = null;
  private overlay_handle: OverlayHandle | null = null;
  private remove_input_listener: (() => void) | null = null;

  private is_initial_picker = false;

  /**
   * @param options 协调器选项。
   */
  constructor(options: AgentChatTuiCoordinatorOptions) {
    this.options = options;
    this.current_session_id = options.session_id;
    this.app_state = {
      agent_id: options.agent_id,
      session_id: options.session_id,
      is_executing: false,
      status_text: "",
    };

    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);
    this.terminal.setTitle(this.build_title());

    this.status_line = new StatusLineComponent(this.app_state);
    this.message_list = new MessageListComponent();
    this.editor = new ChatEditorComponent(this.tui);
    this.editor.on_submit = (text) => {
      void this.handle_user_input(text);
    };
  }

  /**
   * 启动 TUI 并进入事件循环。
   *
   * @param options 启动选项。
   * @returns TUI 停止后 resolve。
   */
  async run(options?: { show_initial_picker?: boolean }): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;

    this.tui.addChild(this.status_line as Component);
    this.tui.addChild(this.message_list as Component);
    this.tui.addChild(this.editor as Component);
    this.tui.setFocus(this.editor as Component);

    this.remove_input_listener = this.tui.addInputListener((data) =>
      this.handle_global_input(data),
    );

    this.add_status_message(
      "Type /help for shortcuts, /session to switch, /new to create, /quit to exit.",
    );
    this.update_layout();
    this.tui.start();

    if (options?.show_initial_picker === true) {
      await this.show_session_picker(true);
    }

    return await new Promise<void>((resolve) => {
      this.resolve_run = resolve;
    });
  }

  /**
   * 停止 TUI 并清理资源。
   */
  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.hide_session_picker();
    this.remove_input_listener?.();
    this.tui.stop();
    this.resolve_run?.();
  }

  /**
   * 请求重新渲染，并在渲染前更新布局。
   */
  private request_render(): void {
    if (this.stopped) {
      return;
    }
    this.update_layout();
    this.tui.requestRender();
  }

  /**
   * 根据终端尺寸重新计算消息流视口高度。
   */
  private update_layout(): void {
    const terminal_rows = this.tui.terminal.rows;
    const terminal_cols = this.tui.terminal.columns;
    const status_height = this.status_line.render(terminal_cols).length || 1;
    const editor_height = this.editor.render(terminal_cols).length || 3;
    const message_height = Math.max(1, terminal_rows - status_height - editor_height);
    this.message_list.set_available_height(message_height);
  }

  /**
   * 处理用户输入。
   *
   * @param raw_text 原始输入文本。
   */
  private async handle_user_input(raw_text: string): Promise<void> {
    if (this.stopped || this.app_state.is_executing) {
      return;
    }

    const text = String(raw_text || "").trim();
    if (!text) {
      this.editor.clear();
      this.request_render();
      return;
    }

    this.editor.clear();

    if (text === "/quit" || text === "/exit") {
      await this.stop();
      return;
    }

    if (text === "/clear") {
      this.message_list.clear();
      this.request_render();
      return;
    }

    if (text === "/help") {
      this.add_status_message("system> /help · /session · /new · /clear · /quit");
      this.request_render();
      return;
    }

    if (text === "/new") {
      await this.create_new_session();
      return;
    }

    if (text === "/session") {
      await this.show_session_picker();
      return;
    }

    await this.run_turn(text);
  }

  /**
   * 执行一轮对话。
   *
   * @param message 用户消息。
   */
  private async run_turn(message: string): Promise<void> {
    this.app_state.is_executing = true;
    this.app_state.status_text = "Thinking...";
    this.status_line.set_state(this.app_state);
    this.editor.disableSubmit = true;
    this.add_user_message(message);
    this.request_render();

    const renderer = new PiTuiChatRenderer(this.message_list);
    const outcome = await this.options.run_turn({
      session_id: this.current_session_id,
      message,
      interactive_renderer: renderer,
    });

    this.app_state.is_executing = false;
    this.app_state.status_text = "";
    this.status_line.set_state(this.app_state);
    this.editor.disableSubmit = false;

    if (!outcome.success) {
      this.add_error_message(outcome.error || "agent chat failed");
    } else if (!outcome.emitted_visible_text) {
      this.add_status_message("assistant> [no visible reply]");
    }

    this.request_render();
  }

  /**
   * 显示 session 选择器弹窗。
   *
   * @param is_initial 是否为启动时的初始选择器。
   */
  private async show_session_picker(is_initial = false): Promise<void> {
    if (this.overlay_handle) {
      return;
    }

    this.is_initial_picker = is_initial;

    let sessions: AgentChatSessionSummaryView[] = [];
    try {
      sessions = await this.options.list_sessions();
    } catch (error) {
      this.add_error_message(this.format_error(error));
      this.request_render();
      return;
    }

    const picker = new SessionPickerComponent({
      sessions,
      current_session_id: this.current_session_id,
      on_select: (result) => {
        this.hide_session_picker();
        if (result.kind === "create") {
          void this.create_new_session();
        } else if (result.sessionId) {
          this.switch_session(result.sessionId);
        }
      },
      on_cancel: () => {
        this.hide_session_picker();
        if (this.is_initial_picker) {
          void this.stop();
        }
      },
    });

    this.overlay_handle = this.tui.showOverlay(picker as Component, {
      width: "80%",
      maxHeight: "70%",
      anchor: "center",
    });
    this.overlay_handle.focus();
    this.request_render();
  }

  /**
   * 隐藏 session 选择器。
   */
  private hide_session_picker(): void {
    if (!this.overlay_handle) {
      return;
    }
    this.overlay_handle.hide();
    this.overlay_handle = null;
    this.tui.setFocus(this.editor as Component);
    this.request_render();
  }

  /**
   * 创建新 session 并切换视图。
   */
  private async create_new_session(): Promise<void> {
    this.add_status_message("status> Creating session...");
    this.request_render();

    try {
      const created = await this.options.create_session();
      this.switch_session(created.session_id);
    } catch (error) {
      this.add_error_message(this.format_error(error));
      this.request_render();
    }
  }

  /**
   * 切换到指定 session。
   *
   * @param session_id 目标 session id。
   */
  private switch_session(session_id: string): void {
    this.current_session_id = session_id;
    this.app_state.session_id = session_id;
    this.status_line.set_state(this.app_state);
    this.terminal.setTitle(this.build_title());
    this.message_list.clear();
    this.add_status_message(`system> Agent chat · ${this.app_state.agent_id} · ${session_id}`);
    this.request_render();
  }

  /**
   * 添加用户消息。
   *
   * @param text 用户文本。
   */
  private add_user_message(text: string): void {
    this.message_list.add_entry({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "user",
      text,
      created_at: Date.now(),
    });
  }

  /**
   * 添加状态提示。
   *
   * @param text 状态文本。
   */
  private add_status_message(text: string): void {
    this.message_list.add_entry({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "status",
      text,
      created_at: Date.now(),
    });
  }

  /**
   * 添加错误提示。
   *
   * @param text 错误文本。
   */
  private add_error_message(text: string): void {
    this.message_list.add_entry({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "error",
      text,
      created_at: Date.now(),
    });
  }

  /**
   * 全局键盘输入处理。
   *
   * @param data pi-tui 输入数据。
   * @returns 是否消费该输入。
   */
  private handle_global_input(data: string): { consume: boolean } | undefined {
    if (this.overlay_handle && !this.overlay_handle.isHidden()) {
      return undefined;
    }
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
      void this.stop();
      return { consume: true };
    }
    return undefined;
  }

  /**
   * 构建终端标题。
   */
  private build_title(): string {
    return `Agent chat · ${this.app_state.agent_id} · ${this.current_session_id}`;
  }

  /**
   * 格式化错误对象。
   *
   * @param error 错误对象。
   * @returns 错误文本。
   */
  private format_error(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
