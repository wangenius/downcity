/**
 * 共享 pi-tui 组件。
 *
 * 关键点（中文）
 * - 用同一套组件承载 Federation dashboard、admin runtime 与后续 city 管理界面。
 * - 组件只关心渲染与输入，不包含 Federation 业务逻辑。
 */

import {
  CURSOR_MARKER,
  Input,
  Key,
  matchesKey,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type {
  tui_dashboard_item,
  tui_prompt_option,
  tui_table_input,
} from "@/shared/types/TuiPrompt.js";
import { tui_pad_end, tui_truncate, tui_viewport, tui_wrap_lines } from "@/shared/tui/TuiText.js";

const BORDER = "─";
const POINTER = "❯";

/**
 * TUI 组件完成回调。
 */
export type tui_component_finish<T> = (value: T) => void;

/**
 * 两栏选择组件构造参数。
 */
export interface tui_select_component_input {
  /** 顶部标题。 */
  title: string;
  /** 顶部副标题或说明。 */
  subtitle?: string;
  /** 底部帮助文案。 */
  footer: string;
  /** 可选项列表。 */
  options: tui_prompt_option[];
  /** 是否显示右侧详情面板。 */
  show_detail: boolean;
  /** 完成选择或取消时触发。 */
  on_finish: tui_component_finish<string | undefined>;
}

/**
 * 多选组件构造参数。
 */
export interface tui_multiselect_component_input {
  /** 顶部标题。 */
  title: string;
  /** 顶部副标题或说明。 */
  subtitle?: string;
  /** 底部帮助文案。 */
  footer: string;
  /** 可选项列表。 */
  options: tui_prompt_option[];
  /** 初始选中的业务值列表。 */
  initial_values?: string[];
  /** 完成选择或取消时触发。 */
  on_finish: tui_component_finish<string[] | undefined>;
}

/**
 * 两栏 dashboard 组件构造参数。
 */
export interface tui_dashboard_component_input {
  /** 顶部标题。 */
  title: string;
  /** 顶部副标题。 */
  subtitle: string;
  /** 底部帮助文案。 */
  footer: string;
  /** 列表项。 */
  items: tui_dashboard_item[];
  /** 完成选择或取消时触发。 */
  on_finish: tui_component_finish<string | undefined>;
}

/**
 * 文本输入组件构造参数。
 */
export interface tui_input_component_input {
  /** 输入页标题。 */
  title: string;
  /** 输入占位或初始提示。 */
  placeholder?: string;
  /** 是否以密文形式返回。当前渲染仍使用单行输入，提交后不回显。 */
  password?: boolean;
  /** 完成输入或取消时触发。 */
  on_finish: tui_component_finish<string | undefined>;
}

/**
 * 文本查看组件构造参数。
 */
export interface tui_text_component_input {
  /** 文本页标题。 */
  title: string;
  /** 文本页内容。 */
  content: string;
  /** 底部帮助文案。 */
  footer: string;
  /** 关闭文本页时触发。 */
  on_finish: tui_component_finish<void>;
}

/**
 * loading 组件构造参数。
 */
export interface tui_loading_component_input {
  /** loading 标题。 */
  title: string;
  /** loading 文案。 */
  message: string;
}

/**
 * 两栏 dashboard 组件。
 */
export class TuiDashboardComponent implements Component, Focusable {
  focused = false;
  private selected_index = 0;
  private detail_scroll = 0;
  private readonly title: string;
  private readonly subtitle: string;
  private readonly footer: string;
  private readonly items: tui_dashboard_item[];
  private readonly on_finish: tui_component_finish<string | undefined>;

  /**
   * @param input 组件构造参数。
   */
  constructor(input: tui_dashboard_component_input) {
    this.title = input.title;
    this.subtitle = input.subtitle;
    this.footer = input.footer;
    this.items = input.items;
    this.on_finish = input.on_finish;
    this.selected_index = find_next_enabled_index(this.items, 0, 1);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.detail_scroll = Math.max(0, this.detail_scroll - 8);
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.detail_scroll += 8;
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const item = this.items[this.selected_index];
      if (!item?.disabled) {
        this.on_finish(item?.id);
      }
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.on_finish(undefined);
    }
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    return render_two_pane({
      width,
      title: this.title,
      subtitle: this.subtitle,
      footer: this.footer,
      left_lines: this.render_list(Math.max(24, Math.floor(width * 0.34))),
      right_lines: this.render_detail(Math.max(20, width - Math.max(24, Math.floor(width * 0.34)) - 3)),
    });
  }

  private move(delta: number): void {
    if (this.items.length === 0) return;
    this.selected_index = find_next_enabled_index(
      this.items,
      this.selected_index + delta,
      delta,
    );
    this.detail_scroll = 0;
  }

  private render_list(width: number): string[] {
    return this.items.map((item, index) => {
      if (item.disabled) {
        return current_theme.dim_fg("textMuted", tui_truncate(`  ${item.title}`, width));
      }
      const selected = index === this.selected_index;
      const pointer = selected ? POINTER : " ";
      const title = selected
        ? current_theme.bold_fg("primary", item.title)
        : current_theme.fg("text", item.title);
      const suffix = item.subtitle ? current_theme.dim_fg("textMuted", ` ${item.subtitle}`) : "";
      return tui_truncate(`${pointer} ${title}${suffix}`, width);
    });
  }

  private render_detail(width: number): string[] {
    const item = this.items[this.selected_index];
    if (!item) return [];
    const lines = [
      current_theme.bold_fg("primary", item.title),
      current_theme.dim_fg("textMuted", item.subtitle),
      "",
      ...tui_wrap_lines(item.detail, width),
    ];
    return tui_viewport(lines, 999, this.detail_scroll);
  }
}

/**
 * 通用多选组件。
 */
export class TuiMultiSelectComponent implements Component, Focusable {
  focused = false;
  private selected_index = 0;
  private detail_scroll = 0;
  private readonly title: string;
  private readonly subtitle: string;
  private readonly footer: string;
  private readonly options: tui_prompt_option[];
  private readonly selected_values: Set<string>;
  private readonly on_finish: tui_component_finish<string[] | undefined>;

  /**
   * @param input 组件构造参数。
   */
  constructor(input: tui_multiselect_component_input) {
    this.title = input.title;
    this.subtitle = input.subtitle ?? "";
    this.footer = input.footer;
    this.options = input.options;
    this.selected_values = new Set(input.initial_values ?? []);
    this.on_finish = input.on_finish;
    this.selected_index = find_next_enabled_index(this.options, 0, 1);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.detail_scroll = Math.max(0, this.detail_scroll - 8);
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.detail_scroll += 8;
      return;
    }
    if (matchesKey(data, Key.space)) {
      this.toggle_current();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.on_finish([...this.selected_values]);
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.on_finish(undefined);
    }
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    const left_width = Math.max(24, Math.floor(width * 0.38));
    return render_two_pane({
      width,
      title: this.title,
      subtitle: this.subtitle,
      footer: this.footer,
      left_lines: this.render_list(left_width),
      right_lines: this.render_detail(Math.max(20, width - left_width - 3)),
    });
  }

  private move(delta: number): void {
    this.selected_index = find_next_enabled_index(this.options, this.selected_index + delta, delta);
    this.detail_scroll = 0;
  }

  private toggle_current(): void {
    const option = this.options[this.selected_index];
    if (!option || option.disabled) return;
    if (this.selected_values.has(option.value)) {
      this.selected_values.delete(option.value);
    } else {
      this.selected_values.add(option.value);
    }
  }

  private render_list(width: number): string[] {
    return this.options.map((option, index) => {
      if (option.disabled) {
        return current_theme.dim_fg("textMuted", tui_truncate(`  ${option.label}`, width));
      }
      const selected = index === this.selected_index;
      const checked = this.selected_values.has(option.value) ? "●" : "○";
      const pointer = selected ? POINTER : " ";
      const label = selected
        ? current_theme.bold_fg("primary", option.label)
        : current_theme.fg("text", option.label);
      const hint = option.hint ? current_theme.dim_fg("textMuted", ` ${option.hint}`) : "";
      return tui_truncate(`${pointer} ${checked} ${label}${hint}`, width);
    });
  }

  private render_detail(width: number): string[] {
    const option = this.options[this.selected_index];
    if (!option) return [];
    const lines = [
      current_theme.bold_fg("primary", option.label),
      "",
      ...tui_wrap_lines(option.hint ?? option.value, width),
    ];
    return tui_viewport(lines, 999, this.detail_scroll);
  }
}

/**
 * 通用选择组件。
 */
export class TuiSelectComponent implements Component, Focusable {
  focused = false;
  private selected_index = 0;
  private detail_scroll = 0;
  private readonly title: string;
  private readonly subtitle: string;
  private readonly footer: string;
  private readonly options: tui_prompt_option[];
  private readonly show_detail: boolean;
  private readonly on_finish: tui_component_finish<string | undefined>;

  /**
   * @param input 组件构造参数。
   */
  constructor(input: tui_select_component_input) {
    this.title = input.title;
    this.subtitle = input.subtitle ?? "";
    this.footer = input.footer;
    this.options = input.options;
    this.show_detail = input.show_detail;
    this.on_finish = input.on_finish;
    this.selected_index = find_next_enabled_index(this.options, 0, 1);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.detail_scroll = Math.max(0, this.detail_scroll - 8);
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.detail_scroll += 8;
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const option = this.options[this.selected_index];
      this.on_finish(option && !option.disabled ? option.value : undefined);
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.on_finish(undefined);
    }
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    if (this.show_detail) {
      const left_width = Math.max(24, Math.floor(width * 0.38));
      return render_two_pane({
        width,
        title: this.title,
        subtitle: this.subtitle,
        footer: this.footer,
        left_lines: this.render_list(left_width),
        right_lines: this.render_detail(Math.max(20, width - left_width - 3)),
      });
    }

    const lines = [
      current_theme.bold_fg("primary", this.title),
      ...(this.subtitle ? [current_theme.dim_fg("textMuted", this.subtitle)] : []),
      "",
      ...this.render_list(width),
      "",
      current_theme.dim_fg("textMuted", this.footer),
    ];
    return lines.map((line) => tui_truncate(line, width));
  }

  private move(delta: number): void {
    this.selected_index = find_next_enabled_index(this.options, this.selected_index + delta, delta);
    this.detail_scroll = 0;
  }

  private render_list(width: number): string[] {
    return this.options.map((option, index) => {
      if (option.disabled) {
        return current_theme.dim_fg("textMuted", tui_truncate(`  ${option.label}`, width));
      }
      const selected = index === this.selected_index;
      const pointer = selected ? POINTER : " ";
      const label = selected
        ? current_theme.bold_fg("primary", option.label)
        : current_theme.fg("text", option.label);
      const hint = option.hint ? current_theme.dim_fg("textMuted", ` ${option.hint}`) : "";
      return tui_truncate(`${pointer} ${label}${hint}`, width);
    });
  }

  private render_detail(width: number): string[] {
    const option = this.options[this.selected_index];
    if (!option) return [];
    const lines = [
      current_theme.bold_fg("primary", option.label),
      "",
      ...tui_wrap_lines(option.hint ?? option.value, width),
    ];
    return tui_viewport(lines, 999, this.detail_scroll);
  }
}

/**
 * 单行输入组件。
 */
export class TuiInputComponent implements Component, Focusable {
  focused = false;
  private readonly input = new Input();
  private readonly title: string;
  private readonly placeholder: string;
  private readonly password: boolean;
  private readonly on_finish: tui_component_finish<string | undefined>;

  /**
   * @param params 组件构造参数。
   */
  constructor(params: tui_input_component_input) {
    this.title = params.title;
    this.placeholder = params.placeholder ?? "";
    this.password = params.password ?? false;
    this.on_finish = params.on_finish;
    if (!this.password && this.placeholder) {
      this.input.setValue(this.placeholder);
    }
    this.input.onSubmit = (value) => this.on_finish(value);
    this.input.onEscape = () => this.on_finish(undefined);
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }

  invalidate(): void {
    this.input.invalidate();
  }

  render(width: number): string[] {
    this.input.focused = this.focused;
    const input_lines = this.password
      ? [this.render_password_line(width)]
      : this.input.render(Math.max(1, width - 4)).map((line) => `  ${line}`);
    return [
      current_theme.bold_fg("primary", this.title),
      current_theme.dim_fg("textMuted", "Enter 提交 · Esc 取消"),
      "",
      ...input_lines,
    ].map((line) => tui_truncate(line, width));
  }

  private render_password_line(width: number): string {
    const value = this.input.getValue();
    const masked = "•".repeat(value.length);
    const cursor = this.focused ? CURSOR_MARKER : "";
    return tui_truncate(`  ${masked}${cursor}`, width);
  }
}

/**
 * 可滚动文本展示组件。
 */
export class TuiTextViewComponent implements Component, Focusable {
  focused = false;
  private scroll_offset = 0;
  private readonly title: string;
  private readonly content: string;
  private readonly footer: string;
  private readonly on_finish: tui_component_finish<void>;

  /**
   * @param input 组件构造参数。
   */
  constructor(input: tui_text_component_input) {
    this.title = input.title;
    this.content = input.content;
    this.footer = input.footer;
    this.on_finish = input.on_finish;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.up)) {
      this.scroll_offset = Math.max(0, this.scroll_offset - 5);
      return;
    }
    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.down)) {
      this.scroll_offset += 5;
      return;
    }
    if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.on_finish();
    }
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    const content_width = Math.max(1, width - 2);
    const lines = tui_wrap_lines(this.content, content_width);
    const viewport_height = Math.max(1, process.stdout.rows - 5);
    const body = tui_viewport(lines, viewport_height, this.scroll_offset);
    return [
      current_theme.bold_fg("primary", this.title),
      current_theme.dim_fg("textMuted", this.footer),
      BORDER.repeat(Math.max(1, width)),
      ...body.map((line) => tui_truncate(line, width)),
    ];
  }
}

/**
 * loading 展示组件。
 */
export class TuiLoadingComponent implements Component {
  private readonly title: string;
  private readonly message: string;
  private frame = 0;
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  /**
   * @param input 组件构造参数。
   */
  constructor(input: tui_loading_component_input) {
    this.title = input.title;
    this.message = input.message;
  }

  tick(): void {
    this.frame = (this.frame + 1) % this.frames.length;
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    return [
      current_theme.bold_fg("primary", this.title),
      "",
      `${current_theme.fg("primary", this.frames[this.frame] ?? "•")} ${this.message}`,
    ].map((line) => tui_truncate(line, width));
  }
}

/**
 * 将表格格式化为可滚动文本内容。
 */
export function format_tui_table(input: tui_table_input): string {
  if (input.rows.length === 0) {
    return input.empty_message ?? "";
  }

  const widths = input.columns.map((column, index) => {
    const row_width = Math.max(
      ...input.rows.map((row) => String(row.cells[index] ?? "").length),
      column.length,
    );
    return Math.min(40, Math.max(8, row_width));
  });

  const header = input.columns
    .map((column, index) => tui_pad_end(column, widths[index] ?? 8))
    .join("  ");
  const divider = widths.map((width) => BORDER.repeat(width)).join("  ");
  const rows = input.rows.map((row) =>
    input.columns
      .map((_column, index) => tui_pad_end(String(row.cells[index] ?? ""), widths[index] ?? 8))
      .join("  "),
  );

  return [header, divider, ...rows].join("\n");
}

function render_two_pane(input: {
  width: number;
  title: string;
  subtitle: string;
  footer: string;
  left_lines: string[];
  right_lines: string[];
}): string[] {
  const width = Math.max(40, input.width);
  const left_width = Math.max(24, Math.min(42, Math.floor(width * 0.38)));
  const right_width = Math.max(10, width - left_width - 3);
  const body_height = Math.max(1, process.stdout.rows - 5);
  const left = input.left_lines.slice(0, body_height);
  const right = input.right_lines.slice(0, body_height);
  const rows = Math.max(left.length, right.length, 1);
  const output = [
    tui_truncate(current_theme.bold_fg("primary", input.title), width),
    tui_truncate(current_theme.dim_fg("textMuted", input.subtitle), width),
    tui_truncate(BORDER.repeat(width), width),
  ];

  for (let index = 0; index < rows; index += 1) {
    const left_line = tui_pad_end(left[index] ?? "", left_width);
    const right_line = tui_truncate(right[index] ?? "", right_width);
    output.push(`${left_line} ${current_theme.dim_fg("border", "│")} ${right_line}`);
  }

  output.push(tui_truncate(BORDER.repeat(width), width));
  output.push(tui_truncate(current_theme.dim_fg("textMuted", input.footer), width));
  return output;
}

function find_next_enabled_index(
  options: Array<{ disabled?: boolean }>,
  start: number,
  delta: number,
): number {
  if (options.length === 0) return 0;
  let index = (start + options.length) % options.length;
  for (let count = 0; count < options.length; count += 1) {
    if (!options[index]?.disabled) return index;
    index = (index + delta + options.length) % options.length;
  }
  return 0;
}
