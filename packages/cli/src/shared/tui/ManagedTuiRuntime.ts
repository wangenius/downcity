/**
 * 共享 pi-tui 运行时。
 *
 * 关键点（中文）
 * - 统一管理 ProcessTerminal / TUI 生命周期。
 * - 对业务层暴露 select、input、text、table、loading 等高层能力。
 * - 每次交互复用同一个 TUI 实例，避免在 admin workspace 内反复退出全屏模式。
 */

import { Container, ProcessTerminal, TUI, type Component, type Focusable } from "@earendil-works/pi-tui";
import {
  format_tui_table,
  TuiDashboardComponent,
  TuiInputComponent,
  TuiLoadingComponent,
  TuiMultiSelectComponent,
  TuiSelectComponent,
  TuiTextViewComponent,
} from "@/shared/tui/TuiComponents.js";
import type {
  tui_dashboard_item,
  tui_message_kind,
  tui_prompt_option,
  tui_table_input,
} from "@/shared/types/TuiPrompt.js";

/**
 * 共享 TUI runtime 构造参数。
 */
export interface managed_tui_runtime_input {
  /** 终端窗口标题。 */
  title: string;
}

/**
 * 共享 TUI runtime。
 */
export class ManagedTuiRuntime {
  private readonly terminal: ProcessTerminal;
  private readonly tui: TUI;
  private readonly root: Container;
  private started = false;
  private closed = false;

  /**
   * @param input runtime 构造参数。
   */
  constructor(input: managed_tui_runtime_input) {
    this.terminal = new ProcessTerminal();
    this.terminal.setTitle(input.title);
    this.tui = new TUI(this.terminal, true);
    this.root = new Container();
    this.tui.addChild(this.root);
  }

  /**
   * 关闭 runtime。
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tui.stop();
  }

  /**
   * 显示 dashboard 并等待用户选择。
   */
  async dashboard(input: {
    title: string;
    subtitle: string;
    footer: string;
    items: tui_dashboard_item[];
  }): Promise<string | undefined> {
    return await this.run_component<string | undefined>((finish) =>
      new TuiDashboardComponent({
        ...input,
        on_finish: finish,
      }),
    );
  }

  /**
   * 显示选择菜单并等待用户选择。
   */
  async select(input: {
    title: string;
    subtitle?: string;
    footer: string;
    options: tui_prompt_option[];
    show_detail?: boolean;
  }): Promise<string | undefined> {
    return await this.run_component<string | undefined>((finish) =>
      new TuiSelectComponent({
        ...input,
        show_detail: input.show_detail ?? true,
        on_finish: finish,
      }),
    );
  }

  /**
   * 显示多选菜单并等待用户提交。
   */
  async multiselect(input: {
    title: string;
    subtitle?: string;
    footer: string;
    options: tui_prompt_option[];
    initial_values?: string[];
  }): Promise<string[] | undefined> {
    return await this.run_component<string[] | undefined>((finish) =>
      new TuiMultiSelectComponent({
        ...input,
        on_finish: finish,
      }),
    );
  }

  /**
   * 显示文本输入并等待提交。
   */
  async text(input: {
    title: string;
    placeholder?: string;
    password?: boolean;
  }): Promise<string | undefined> {
    return await this.run_component<string | undefined>((finish) =>
      new TuiInputComponent({
        ...input,
        on_finish: finish,
      }),
    );
  }

  /**
   * 显示可滚动文本。
   */
  async show_text(title: string, content: string): Promise<void> {
    await this.run_component<void>((finish) =>
      new TuiTextViewComponent({
        title,
        content,
        footer: "Enter / Esc 返回 · ↑↓ / PageUp PageDown 滚动",
        on_finish: finish,
      }),
    );
  }

  /**
   * 显示表格。
   */
  async show_table(input: tui_table_input): Promise<void> {
    await this.show_text(input.title, format_tui_table(input));
  }

  /**
   * 显示 JSON。
   */
  async show_json(title: string, data: unknown): Promise<void> {
    await this.show_text(title, JSON.stringify(data, null, 2));
  }

  /**
   * 显示短消息。
   */
  async show_message(kind: tui_message_kind, message: string): Promise<void> {
    await this.show_text(kind.toUpperCase(), message);
  }

  /**
   * 显示 loading 并执行异步任务。
   */
  async with_loading<T>(title: string, task: () => Promise<T>): Promise<T> {
    this.ensure_started();
    const component = new TuiLoadingComponent({
      title,
      message: title,
    });
    this.set_component(component);
    const interval = setInterval(() => {
      component.tick();
      this.tui.requestRender();
    }, 80);
    try {
      return await task();
    } finally {
      clearInterval(interval);
    }
  }

  /**
   * 运行自定义组件。
   *
   * 关键点（中文）
   * - 复杂业务屏幕可以通过这个扩展点复用 shared runtime 的生命周期。
   * - 组件内部仍只负责 render / handleInput，不直接接触 ProcessTerminal。
   */
  async run_custom<T>(
    create_component: (
      finish: (value: T) => void,
      request_render: () => void,
    ) => Component & Partial<Focusable>,
  ): Promise<T> {
    return await this.run_component<T>((finish) =>
      create_component(finish, () => this.tui.requestRender()),
    );
  }

  private async run_component<T>(
    create_component: (finish: (value: T) => void) => Component & Partial<Focusable>,
  ): Promise<T> {
    this.ensure_started();
    return await new Promise<T>((resolve) => {
      let finished = false;
      const finish = (value: T): void => {
        if (finished) return;
        finished = true;
        resolve(value);
      };
      this.set_component(create_component(finish));
    });
  }

  private ensure_started(): void {
    if (this.started) return;
    this.started = true;
    this.tui.start();
  }

  private set_component(component: Component & Partial<Focusable>): void {
    this.root.clear();
    this.root.addChild(component);
    this.tui.setFocus(component);
    this.tui.requestRender(true);
  }
}
