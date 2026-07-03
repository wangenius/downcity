
/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code 的 Agent prompt 样式：顶部标题分隔线（── input ─────）、
 *   左侧两列空白 prompt 前缀、描述换行的 slash 自动完成，以及标准应用级快捷键回调。
 * - slash 命令 token 高亮作为本组件的本地增强保留。
 */

import {
  Editor,
  isKeyRelease,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  type TUI,
} from "@earendil-works/pi-tui";

import { BUILTIN_SLASH_COMMANDS } from "@/city/agent/tui/commands/index.js";
import { createEditorTheme } from "@/city/agent/tui/theme/pi-tui-theme.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import { FileMentionProvider } from "@/city/agent/tui/components/editor/FileMentionProvider.js";
import { WrappingSelectList } from "@/city/agent/tui/components/editor/WrappingSelectList.js";

// oxlint-disable-next-line no-control-regex -- ESC 是匹配 ANSI SGR 转义序列所必需的。
const ANSI_SGR = /\u001B\[[0-9;]*m/g;

// paste marker 形如 [paste #1 +123 lines] / [paste #2 1234 chars]。
const PASTE_MARKER_RE = /\[paste #(\d+)(?: ((?:\+\d+ lines|\d+ chars)))?\]/g;
const BRACKET_PASTE_START = "\u001B[200~";
const BRACKET_PASTE_END = "\u001B[201~";

// Kitty keyboard protocol CSI-u 序列：ESC [ keycode ; modifier[:eventType] u。
// oxlint-disable-next-line no-control-regex
const KITTY_CSI_U = /^\u001B\[(\d+);(\d+)((?::\d+)*)u$/;
const CAPS_LOCK_BIT = 64;
const CTRL_BIT = 4;
const SHIFT_BIT = 1;

// 与 pi-tui 私有常量保持一致（dist/components/editor.js）。
const SLASH_COMMAND_SELECT_LIST_LAYOUT = {
  minPrimaryColumnWidth: 12,
  maxPrimaryColumnWidth: 32,
} as const;

interface AutocompleteListFactoryInternals {
  createAutocompleteList?: (prefix: string, items: SelectItem[]) => SelectList;
}

interface AutocompleteInternals {
  cancelAutocomplete(): void;
  readonly autocompleteAbort?: AbortController;
  readonly autocompleteDebounceTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 输入框提交回调。
 */
export type ChatEditorSubmitHandler = (text: string) => void;

/**
 * 聊天输入框。
 */
export class ChatEditorComponent extends Editor {
  on_escape?: () => void;
  on_ctrl_c?: () => void;
  on_ctrl_d?: () => void;
  on_ctrl_g?: () => void;
  on_ctrl_o?: () => void;
  on_ctrl_s?: () => void;
  on_undo?: () => void;
  on_insert_newline?: () => void;
  on_text_paste?: () => void;
  on_shift_tab?: () => void;
  /** 空编辑器时按 ↑，返回 true 表示已消费。 */
  on_up_arrow_empty?: () => boolean;
  /** 空编辑器时按 ↓，返回 true 表示已消费。 */
  on_down_arrow_empty?: () => boolean;
  /**
   * 粘贴图片回调（Unix 用 Ctrl-V，Windows 用 Alt-V）。
   * 返回 true 表示已处理，false 继续走普通粘贴。
   */
  on_paste_image?: () => Promise<boolean>;

  private consuming_paste = false;
  private consume_buffer = "";
  private submit_handler?: ChatEditorSubmitHandler;

  /**
   * @param tui 所属 TUI 实例。
   */
  constructor(tui: TUI) {
    const theme = createEditorTheme();
    // Kimi Code 的 Agent prompt 左侧只有两列空白前缀，没有完整边框内的额外 padding。
    super(tui, theme, { paddingX: 2 });
    this.borderColor = (text: string) => theme.borderColor(text);

    // slash 命令使用 WrappingSelectList，@ 文件路径保持 pi-tui 默认 SelectList。
    (this as unknown as AutocompleteListFactoryInternals).createAutocompleteList = (
      prefix: string,
      items: SelectItem[],
    ) => {
      if (prefix.startsWith("/")) {
        return new WrappingSelectList(
          items,
          this.getAutocompleteMaxVisible(),
          theme.selectList,
          SLASH_COMMAND_SELECT_LIST_LAYOUT,
        );
      }
      return new SelectList(items, this.getAutocompleteMaxVisible(), theme.selectList);
    };

    this.setAutocompleteProvider(
      new FileMentionProvider(BUILTIN_SLASH_COMMANDS, process.cwd()),
    );
  }

  /**
   * 设置提交回调。
   */
  set on_submit(handler: ChatEditorSubmitHandler | undefined) {
    this.submit_handler = handler;
    this.onSubmit = (text: string) => {
      handler?.(text);
    };
  }

  /**
   * 获取提交回调。
   */
  get on_submit(): ChatEditorSubmitHandler | undefined {
    return this.submit_handler;
  }

  /**
   * 清空当前输入。
   */
  clear(): void {
    this.setText("");
  }

  override handleInput(data: string): void {
    const normalized = normalize_caps_locked_ctrl(data);
    if (isKeyRelease(normalized)) {
      return;
    }

    // 如果刚刚展开了一个 paste marker，丢弃终端随 Ctrl-V 一起发送的 bracketed paste 尾部。
    if (this.consuming_paste) {
      this.consume_buffer += normalized;
      if (this.consume_buffer.includes(BRACKET_PASTE_END)) {
        this.consuming_paste = false;
        this.consume_buffer = "";
      }
      return;
    }

    // 光标落在已有 paste marker 上时，先展开 marker 而不是粘贴新内容。
    if (normalized.includes(BRACKET_PASTE_START) && this.expand_paste_marker_at_cursor()) {
      if (!normalized.includes(BRACKET_PASTE_END)) {
        this.consuming_paste = true;
      }
      return;
    }

    // 粘贴图片：Windows 终端保留 Ctrl-V 做自带粘贴，用 Alt-V。
    const paste_key = process.platform === "win32" ? "alt+v" : Key.ctrl("v");
    if (matchesKey(normalized, paste_key)) {
      if (this.expand_paste_marker_at_cursor()) {
        return;
      }
      if (this.on_paste_image !== undefined) {
        const handler = this.on_paste_image;
        void handler().then((handled) => {
          if (!handled) {
            this.on_text_paste?.();
            super.handleInput.call(this, normalized);
          }
        });
        return;
      }
    }

    if (matchesKey(normalized, Key.ctrl("d"))) {
      if (this.getText().length === 0) {
        this.on_ctrl_d?.();
        return;
      }
    }

    if (matchesKey(normalized, Key.ctrl("c"))) {
      this.on_ctrl_c?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl("g"))) {
      this.on_ctrl_g?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl("o"))) {
      this.on_ctrl_o?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl("s"))) {
      this.on_ctrl_s?.();
      return;
    }

    const newline_input = get_newline_input(normalized);
    if (newline_input !== undefined) {
      this.on_insert_newline?.();
      super.handleInput(newline_input);
      return;
    }

    if (matchesKey(normalized, "shift+tab")) {
      this.on_shift_tab?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl("-"))) {
      this.on_undo?.();
    }

    if (matchesKey(normalized, Key.up)) {
      if (this.getText().length === 0 && this.on_up_arrow_empty) {
        if (this.on_up_arrow_empty()) return;
      }
    }

    if (matchesKey(normalized, Key.down)) {
      if (this.getText().length === 0 && this.on_down_arrow_empty) {
        if (this.on_down_arrow_empty()) return;
      }
    }

    if (matchesKey(normalized, Key.escape)) {
      if (this.has_autocomplete_activity()) {
        this.cancel_autocomplete_activity();
        return;
      }
      this.on_escape?.();
      return;
    }

    super.handleInput(normalized);
  }

  /**
   * 覆写渲染，输出 Kimi Code 风格的 Agent prompt：
   * - 顶部标题分隔线 `── input ─────`。
   * - 内容区左侧保留两列空白前缀，不再注入 `>` prompt 符号。
   * - 移除 pi-tui Editor 的底部水平边框与左右侧边框。
   * - 高亮 slash 命令 token。
   */
  override render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 3) {
      return lines;
    }

    // 顶部边框替换为标题线；底部边框移除。
    lines[0] = render_input_header(width);
    lines.pop();

    // 高亮第一行里的 slash 命令 token。
    const first_content_index = 1;
    const text = this.getText().trimStart();
    if (text.startsWith("/")) {
      const original = lines[first_content_index];
      if (original !== undefined) {
        const highlighted = highlight_first_slash_token(original);
        if (highlighted !== undefined) {
          lines[first_content_index] = highlighted;
        }
      }
    }

    return lines;
  }

  /**
   * 是否正在显示自动完成或仍有未完成的补全请求。
   */
  private has_autocomplete_activity(): boolean {
    const autocomplete = this as unknown as AutocompleteInternals;
    return (
      this.isShowingAutocomplete() ||
      autocomplete.autocompleteAbort !== undefined ||
      autocomplete.autocompleteDebounceTimer !== undefined
    );
  }

  private cancel_autocomplete_activity(): void {
    (this as unknown as AutocompleteInternals).cancelAutocomplete();
  }

  /**
   * 如果光标位于 paste marker 上，将其展开为实际内容。
   */
  private expand_paste_marker_at_cursor(): boolean {
    const { line, col } = this.getCursor();
    const lines = this.getLines();
    const current_line = lines[line] ?? "";

    for (const match of current_line.matchAll(PASTE_MARKER_RE)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (col < start || col > end) continue;

      const paste_id = Number(match[1]);
      const pastes = (this as unknown as { pastes: Map<number, string> }).pastes;
      const content = pastes.get(paste_id);
      if (content === undefined) return false;

      const text = this.getText();
      const offset = lines.slice(0, line).reduce((sum, l) => sum + l.length + 1, 0) + start;
      const new_text = text.slice(0, offset) + content + text.slice(offset + match[0].length);
      this.setText(new_text);
      return true;
    }
    return false;
  }
}

/**
 * 处理 caps-lock 开启时 Kitty 键盘协议下 ctrl+字母的序列异常。
 */
function normalize_caps_locked_ctrl(data: string): string {
  const match = data.match(KITTY_CSI_U);
  if (match === null) {
    return data;
  }
  const codepoint = Number(match[1]);
  const modifier_plus_1 = Number(match[2]);
  const tail = match[3] ?? "";
  if (!Number.isFinite(codepoint) || !Number.isFinite(modifier_plus_1)) {
    return data;
  }
  const modifier = modifier_plus_1 - 1;
  if ((modifier & CAPS_LOCK_BIT) === 0) {
    return data;
  }
  if ((modifier & CTRL_BIT) === 0) {
    return data;
  }
  if ((modifier & SHIFT_BIT) !== 0) {
    return data;
  }
  if (codepoint < 65 || codepoint > 90) {
    return data;
  }
  const lowered_codepoint = codepoint + 32;
  const stripped_modifier = (modifier & ~CAPS_LOCK_BIT) + 1;
  return "\u001B[" + String(lowered_codepoint) + ";" + String(stripped_modifier) + tail + "u";
}

function get_newline_input(data: string): string | undefined {
  if (data === "\n" || data === "\u001B\r" || data === "\u001B[13;2~") {
    return data;
  }
  if (matchesKey(data, Key.ctrl("j"))) {
    return "\n";
  }
  return undefined;
}

/**
 * 将可见字符索引映射回带 ANSI 转义字符串中的原始索引。
 */
function map_visible_idx_to_raw(line: string, visible_idx: number): number {
  let visible_count = 0;
  let i = 0;
  const re = new RegExp(ANSI_SGR.source, "y");
  while (i < line.length && visible_count < visible_idx) {
    re.lastIndex = i;
    const match = re.exec(line);
    if (match !== null && match.index === i) {
      i += match[0].length;
    } else {
      visible_count += 1;
      i += 1;
    }
  }
  return i;
}

function strip_sgr(s: string): string {
  return s.replace(ANSI_SGR, "");
}

/**
 * 高亮第一行里的 /token。
 */
function highlight_first_slash_token(line: string): string | undefined {
  const visible = strip_sgr(line);
  const slash_index = visible.indexOf("/");
  if (slash_index < 0) {
    return undefined;
  }
  for (let i = 0; i < slash_index; i += 1) {
    const ch = visible[i];
    if (ch !== " " && ch !== "\t") {
      return undefined;
    }
  }
  let end_visible = slash_index + 1;
  while (end_visible < visible.length) {
    const ch = visible[end_visible];
    if (ch === " " || ch === "\t") {
      break;
    }
    end_visible += 1;
  }
  const token = visible.slice(slash_index, end_visible);
  if (token.slice(1).includes("/")) {
    return undefined;
  }
  const ranges = [{ start: slash_index, end: end_visible }];
  if (token === "/goal") {
    ranges.push(...goal_command_path_ranges(visible, end_visible));
  }
  return highlight_visible_ranges(line, ranges);
}

function goal_command_path_ranges(
  visible: string,
  command_end: number,
): Array<{ start: number; end: number }> {
  const next_range = read_token_range(visible, command_end);
  if (next_range === null || visible.slice(next_range.start, next_range.end) !== "next") {
    return [];
  }
  const ranges = [next_range];
  const manage_range = read_token_range(visible, next_range.end);
  if (
    manage_range !== null &&
    visible.slice(manage_range.start, manage_range.end) === "manage"
  ) {
    ranges.push(manage_range);
  }
  return ranges;
}

function read_token_range(
  visible: string,
  start: number,
): { start: number; end: number } | null {
  let token_start = start;
  while (token_start < visible.length && is_token_space(visible[token_start])) token_start += 1;
  if (token_start >= visible.length) return null;
  let token_end = token_start;
  while (token_end < visible.length && !is_token_space(visible[token_end])) token_end += 1;
  return { start: token_start, end: token_end };
}

function is_token_space(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

function highlight_visible_ranges(
  line: string,
  ranges: Array<{ start: number; end: number }>,
): string {
  let out = "";
  let raw_cursor = 0;
  for (const range of ranges) {
    const raw_start = map_visible_idx_to_raw(line, range.start);
    const raw_end = map_visible_idx_to_raw(line, range.end);
    out += line.slice(raw_cursor, raw_start);
    out += current_theme.bold_fg("primary", line.slice(raw_start, raw_end));
    raw_cursor = raw_end;
  }
  return out + line.slice(raw_cursor);
}

/**
 * 渲染 Kimi Code 风格的顶部标题分隔线：
 * `── input ───────`。
 *
 * @param width 可用宽度。
 * @returns 标题行。
 */
function render_input_header(width: number): string {
  if (width <= 0) {
    return "";
  }
  const title = " input ";
  const fill = Math.max(0, width - title.length - 2);
  const line = `──${title}${"─".repeat(fill)}`;
  // 标题线在应用颜色前是纯 ASCII，直接按字符截断即可，避免小宽度下出现省略号。
  return current_theme.fg("border", line.slice(0, width));
}
