/**
 * city agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code 的 KimiTUI 布局：transcript + status/activity + editor。
 * - transcript 使用可滚动消息流，支持 PageUp/PageDown 回看历史。
 * - 编辑器负责消费标准快捷键（Ctrl+C/D/O/S），再回调 coordinator。
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
  StatusLineComponent,
} from "@/city/agent/tui/components/index.js";
import { MessageListComponent } from "@/city/agent/tui/components/MessageList.js";
import { SessionPickerComponent } from "@/city/agent/tui/dialogs/SessionPicker.js";
import { ApprovalDialogComponent } from "@/city/agent/tui/dialogs/ApprovalDialog.js";
import { PiTuiChatRenderer } from "@/city/agent/tui/PiTuiChatRenderer.js";
import type { AgentChatSessionSummaryView } from "@/city/agent/AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "@/city/types/AgentChatInteractive.js";
import type { AppState } from "@/city/agent/tui/types.js";
import {
  dispatchSlashCommand,
  resolveSlashCommandInput,
  type SlashCommandHost,
} from "@/city/agent/tui/commands/index.js";

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

  /** 批准 unrestricted sandbox 审批请求。 */
  approve: (approval_id: string) => Promise<{ success: boolean; decision: string }>;

  /** 拒绝 unrestricted sandbox 审批请求。 */
  deny: (approval_id: string) => Promise<{ success: boolean; decision: string }>;
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

  /**
   * 全局 tool output 展开状态。
   * 对齐 Kimi Code：Ctrl+O 统一切换所有 tool 卡片，
   * 新创建的 tool 卡片也会沿用当前状态。
   */
  private tool_output_expanded = false;

  /**
   * 待处理的 unrestricted sandbox 审批请求队列。
   * 当模型并行发起多个需要审批的 tool call 时，依次弹出选择器。
   */
  private approval_queue: Array<{
    approval_id: string;
    tool_name: string;
    cmd: string;
    cwd: string;
    reason: string;
  }> = [];

  /**
   * slash 命令宿主，解耦命令分发与 coordinator 内部实现。
   */
  private get slash_command_host(): SlashCommandHost {
    return {
      is_streaming: this.app_state.is_executing,
      send_normal_user_input: async (text: string) => {
        await this.run_turn(text);
      },
      show_error: (text: string) => {
        this.add_error_message(text);
      },
      show_help: () => {
        this.add_status_message("/help · /session · /new · /clear · /quit");
      },
      clear_transcript: () => {
        this.message_list.clear();
      },
      create_new_session: async () => {
        await this.create_new_session();
      },
      show_session_picker: async () => {
        await this.show_session_picker();
      },
      approve: async (approval_id) => {
        await this.approve(approval_id);
      },
      deny: async (approval_id) => {
        await this.deny(approval_id);
      },
      stop: async () => {
        await this.stop();
      },
    };
  }

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

    this.status_line = new StatusLineComponent(this.app_state, this.tui);
    this.editor = new ChatEditorComponent(this.tui);
    this.editor.connected_above = true;

    this.message_list = new MessageListComponent({
      get_viewport_height: () => this.get_message_list_viewport_height(),
    });

    this.editor.on_submit = (text) => {
      void this.handle_user_input(text);
    };
    this.editor.on_ctrl_c = () => {
      void this.stop();
    };
    this.editor.on_ctrl_d = () => {
      void this.stop();
    };
    this.editor.on_ctrl_s = () => {
      void this.stop();
    };
    this.editor.on_ctrl_o = () => {
      this.toggle_tool_output_expansion();
      this.request_render();
    };
  }

  /**
   * 启动 TUI 并进入事件循环。
   *
   * @param options 启动选项。
   * @returns TUI 停止后 resolve。
   */
  async run(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;

    // 顺序：transcript → status/activity → editor，最新内容靠近底部输入区。
    this.tui.addChild(this.message_list as Component);
    this.tui.addChild(this.status_line as Component);
    this.tui.addChild(this.editor as Component);
    this.tui.setFocus(this.editor as Component);

    this.remove_input_listener = this.tui.addInputListener((data) =>
      this.handle_global_input(data),
    );

    this.add_status_message(
      "Type /help for shortcuts · /session · /new · /clear · /quit",
    );
    this.tui.start();

    return await new Promise<void>((resolve) => {
      this.resolve_run = resolve;
    });
  }

  /**
   * 入队并尝试显示 unrestricted sandbox 审批弹窗。
   */
  private show_approval_dialog(params: {
    approval_id: string;
    tool_name: string;
    cmd: string;
    cwd: string;
    reason: string;
  }): void {
    if (this.stopped) {
      return;
    }
    this.approval_queue.push(params);
    this.ensure_approval_dialog();
  }

  /**
   * 如果当前没有弹窗且队列非空，显示下一个审批弹窗。
   */
  private ensure_approval_dialog(): void {
    if (this.overlay_handle || this.stopped || this.approval_queue.length === 0) {
      return;
    }

    const params = this.approval_queue[0];
    const dialog = new ApprovalDialogComponent({
      approval_id: params.approval_id,
      tool_name: params.tool_name,
      cmd: params.cmd,
      cwd: params.cwd,
      reason: params.reason,
      on_decide: (decision) => {
        this.hide_approval_dialog();
        if (decision === "approve") {
          void this.approve(params.approval_id);
        } else if (decision === "deny") {
          void this.deny(params.approval_id);
        }
        this.ensure_approval_dialog();
      },
    });

    this.overlay_handle = this.tui.showOverlay(dialog as Component, {
      width: "80%",
      maxHeight: "70%",
      anchor: "center",
    });
    this.overlay_handle.focus();
    this.request_render();
  }

  /**
   * 隐藏当前弹窗并从队列移除当前请求。
   */
  private hide_approval_dialog(): void {
    this.approval_queue.shift();
    if (!this.overlay_handle) {
      return;
    }
    this.overlay_handle.hide();
    this.overlay_handle = null;
    this.tui.setFocus(this.editor as Component);
    this.request_render();
  }

  /**
   * 批准指定审批请求。
   */
  private async approve(approval_id?: string): Promise<void> {
    const target_id = String(approval_id || "").trim();
    if (!target_id) {
      this.add_error_message("Usage: /approve <approval_id>");
      this.request_render();
      return;
    }
    try {
      const result = await this.options.approve(target_id);
      if (!result.success) {
        this.add_error_message(`Failed to approve ${target_id}`);
      }
    } catch (error) {
      this.add_error_message(this.format_error(error));
    }
    this.request_render();
  }

  /**
   * 拒绝指定审批请求。
   */
  private async deny(approval_id?: string): Promise<void> {
    const target_id = String(approval_id || "").trim();
    if (!target_id) {
      this.add_error_message("Usage: /deny <approval_id>");
      this.request_render();
      return;
    }
    try {
      const result = await this.options.deny(target_id);
      if (!result.success) {
        this.add_error_message(`Failed to deny ${target_id}`);
      }
    } catch (error) {
      this.add_error_message(this.format_error(error));
    }
    this.request_render();
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
    this.hide_approval_dialog();
    this.remove_input_listener?.();
    this.status_line.dispose();
    this.tui.stop();
    this.resolve_run?.();
  }

  /**
   * 请求重新渲染。
   */
  private request_render(): void {
    if (this.stopped) {
      return;
    }
    this.tui.requestRender();
  }

  /**
   * 计算消息流当前可用的可视高度。
   */
  private get_message_list_viewport_height(): number {
    const width = this.terminal.columns;
    const status_lines = this.status_line.render(width).length;
    const editor_lines = this.editor.render(width).length;
    return Math.max(1, this.terminal.rows - status_lines - editor_lines);
  }

  /**
   * 处理用户输入。
   *
   * @param raw_text 原始输入文本。
   */
  private async handle_user_input(raw_text: string): Promise<void> {
    if (this.stopped) {
      return;
    }

    const text = String(raw_text || "").trim();
    if (!text) {
      this.editor.clear();
      this.request_render();
      return;
    }

    this.editor.clear();
    this.message_list.scroll_to_bottom();

    const intent = resolveSlashCommandInput({
      input: text,
      is_streaming: this.app_state.is_executing,
    });

    if (
      intent.kind === "builtin" ||
      intent.kind === "blocked" ||
      intent.kind === "invalid"
    ) {
      await dispatchSlashCommand(this.slash_command_host, intent);
      this.request_render();
      return;
    }

    if (intent.kind === "message") {
      await this.run_turn(intent.input);
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
    this.app_state.status_text = "working...";
    this.status_line.set_state(this.app_state);
    this.editor.disableSubmit = true;
    this.message_list.scroll_to_bottom();
    this.add_user_message(message);
    this.request_render();

    const renderer = new PiTuiChatRenderer(
      this.message_list,
      () => this.request_render(),
      (params) => {
        this.show_approval_dialog(params);
      },
    );
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
      this.add_status_message("[no visible reply]");
    }

    this.request_render();
  }

  /**
   * 显示 session 选择器弹窗。
   */
  private async show_session_picker(): Promise<void> {
    if (this.overlay_handle) {
      return;
    }

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
    this.add_status_message("Creating session...");
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
    this.add_status_message(`Agent chat · ${this.app_state.agent_id} · ${session_id}`);
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

    const page_size = Math.max(1, this.get_message_list_viewport_height() - 1);

    if (matchesKey(data, Key.pageUp)) {
      this.message_list.scroll_by(page_size);
      this.request_render();
      return { consume: true };
    }
    if (matchesKey(data, Key.pageDown)) {
      this.message_list.scroll_by(-page_size);
      this.request_render();
      return { consume: true };
    }
    if (matchesKey(data, Key.shift("up"))) {
      this.message_list.scroll_by(1);
      this.request_render();
      return { consume: true };
    }
    if (matchesKey(data, Key.shift("down"))) {
      this.message_list.scroll_by(-1);
      this.request_render();
      return { consume: true };
    }
    if (matchesKey(data, Key.ctrl("l"))) {
      this.message_list.scroll_to_bottom();
      this.request_render();
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

  /**
   * 统一切换所有 tool 卡片的展开/折叠状态。
   * 对齐 Kimi Code 的 Ctrl+O：全局 toolOutputExpanded 翻转，
   * 同时作用于现有及后续新建的 tool 卡片。
   */
  private toggle_tool_output_expansion(): void {
    this.tool_output_expanded = !this.tool_output_expanded;
    this.message_list.set_all_tool_blocks_expanded(this.tool_output_expanded);
  }
}
