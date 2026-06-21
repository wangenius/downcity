/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 直接对齐 Kimi Code 的 CustomEditor：带完整边框、prompt 符号、slash 高亮、
 *   描述换行的 slash 自动完成，以及标准应用级快捷键回调。
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
import { SlashFirstAutocompleteProvider } from "@/city/agent/tui/components/editor/SlashCommandAutocompleteProvider.js";

import { BUILTIN_SLASH_COMMANDS } from "@/city/agent/tui/commands/index.js";
import { createEditorTheme } from "@/city/agent/tui/theme/pi-tui-theme.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import { WrappingSelectList } from "@/city/agent/tui/components/editor/WrappingSelectList.js";

// oxlint-disable-next-line no-control-regex -- ESC 是匹配 ANSI SGR 转义序列所必需的。
const ANSI_SGR = /\u001B\[[0-9;]*m/g;

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
  connected_above = false;

  private submit_handler?: ChatEditorSubmitHandler;

  /**
   * @param tui 所属 TUI 实例。
   */
  constructor(tui: TUI) {
    const theme = createEditorTheme();
    super(tui, theme, { paddingX: 4 });
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
      new SlashFirstAutocompleteProvider(BUILTIN_SLASH_COMMANDS, process.cwd()),
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
      super.handleInput(newline_input);
      return;
    }

    if (matchesKey(normalized, Key.escape)) {
      if (this.isShowingAutocomplete()) {
        this.cancel_autocomplete_activity();
        return;
      }
      this.on_escape?.();
      return;
    }

    super.handleInput(normalized);
  }

  /**
   * 覆写渲染，注入 prompt 符号、高亮 slash 命令，并补全边框。
   */
  override render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 3) {
      return lines;
    }

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

    const first_content = lines[first_content_index];
    if (first_content !== undefined) {
      const with_prompt = inject_prompt_symbol(first_content);
      if (with_prompt !== undefined) {
        lines[first_content_index] = with_prompt;
      }
    }

    return wrap_with_side_borders(lines, (s) => this.borderColor(s), {
      connected_above: this.connected_above,
    });
  }

  private cancel_autocomplete_activity(): void {
    (this as unknown as AutocompleteInternals).cancelAutocomplete();
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
  return `\u001B[${String(lowered_codepoint)};${String(stripped_modifier)}${tail}u`;
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
 * 高亮第一行里的 `/token`。
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
  return highlight_visible_ranges(line, [{ start: slash_index, end: end_visible }]);
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
 * 在第一行内容前注入 `> ` prompt 符号。
 */
function inject_prompt_symbol(line: string): string | undefined {
  if (line.length < 4) {
    return undefined;
  }
  for (let i = 0; i < 4; i += 1) {
    if (line[i] !== " ") {
      return undefined;
    }
  }
  return "  > " + line.slice(4);
}

interface WrapBorderOptions {
  connected_above?: boolean;
}

/**
 * 为 pi-tui Editor 的渲染结果补全四角和侧边框。
 */
function wrap_with_side_borders(
  lines: string[],
  paint: (s: string) => string,
  options: WrapBorderOptions = {},
): string[] {
  let seen_top = false;
  return lines.map((line) => {
    const plain = strip_sgr(line);
    if (plain.length > 0 && plain[0] === "─") {
      const left_corner = seen_top
        ? "╰"
        : options.connected_above === true
          ? "├"
          : "╭";
      const right_corner = seen_top
        ? "╯"
        : options.connected_above === true
          ? "┤"
          : "╮";
      seen_top = true;
      if (plain.length === 1) {
        return paint(left_corner);
      }
      const middle = plain.slice(1, -1);
      return paint(left_corner + middle + right_corner);
    }
    if (line.length === 0) {
      return line;
    }
    const first_ch = line[0];
    const last_ch = line.at(-1);
    const head = first_ch === " " ? paint("│") : (first_ch ?? "");
    const tail = line.length > 1 && last_ch === " " ? paint("│") : (last_ch ?? "");
    if (line.length === 1) {
      return head;
    }
    return head + line.slice(1, -1) + tail;
  });
}
