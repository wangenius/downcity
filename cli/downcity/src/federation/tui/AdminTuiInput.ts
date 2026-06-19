/**
 * Admin TUI 输入循环模块。
 *
 * 关键点（中文）
 * - 负责侧边栏选择、文本输入、密码输入的交互循环。
 * - 与 Render 模块配合：数据变更时调用 Render 刷新屏幕。
 */

import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import {
  type blessed_list_element,
  type blessed_textbox_element,
  is_plain_escape_input,
  type shell_layout,
} from "./AdminTuiShell.js";
import { is_disabled_option, render_sidebar_hint } from "./AdminTuiRender.js";
import type { admin_tui_select_option } from "../types/AdminTui.js";

/**
 * 运行侧边栏单选。
 */
export async function run_sidebar_select(input: {
  shell: shell_layout;
  title: string;
  options: admin_tui_select_option[];
  initial_index: number;
  on_select_index: (index: number) => void;
  on_focus_option?: (option: admin_tui_select_option | undefined) => void;
}): Promise<string | undefined> {
  return await new Promise<string | undefined>((resolve) => {
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;
    const list = input.shell.nav_list;
    let selected_index = resolve_selectable_index(input.options, input.initial_index, 0);
    const sync_selection = (index_value: unknown = list.selected): void => {
      selected_index = resolve_selectable_index(input.options, index_value, selected_index);
      if (list.selected !== selected_index) {
        list.select(selected_index);
      }
      input.on_select_index(selected_index);
      input.on_focus_option?.(input.options[selected_index]);
      render_sidebar_hint(input.shell, input.options, selected_index);
    };
    const keypress_listener = (_ch: unknown, key: unknown): void => {
      const key_name = get_key_name(key);
      if (key_name === "enter") {
        sync_selection();
        if (is_disabled_option(input.options[selected_index])) {
          return;
        }
        finish(input.options[selected_index]?.value);
        return;
      }
      if (key_name === "escape" || key_name === "q" || key_name === "C-c") {
        finish(undefined);
        return;
      }
      setImmediate(() => {
        if (finished) return;
        sync_selection();
      });
    };
    const select_item_listener = (_item: unknown, index_value: unknown): void => {
      sync_selection(index_value);
    };

    const finish = (value: string | undefined): void => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
      list.removeListener("keypress", keypress_listener);
      list.removeListener("select item", select_item_listener);
    };

    list.select(selected_index);
    list.focus();
    sync_selection(selected_index);
    list.on("keypress", keypress_listener);
    list.on("select item", select_item_listener);
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        sync_selection();
        if (is_disabled_option(input.options[selected_index])) {
          return;
        }
        finish(input.options[selected_index]?.value);
      }
    };
    process.stdin.on("data", raw_input_listener);
    input.shell.screen.render();
  });
}

/**
 * 在内容区运行文本/密码输入。
 */
export async function run_text_in_content(
  shell: shell_layout,
  input: {
    title: string;
    placeholder?: string;
    secret: boolean;
    on_cleanup: (cleanup: () => void) => void;
  },
): Promise<string | undefined> {
  return await new Promise<string | undefined>((resolve) => {
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    shell.content_box.setLabel(` ${input.title} `);
    blessed.box({
      parent: shell.content_box,
      top: 1,
      left: "center",
      width: "88%",
      height: 3,
      align: "center",
      valign: "middle",
      tags: true,
      content: `{bold}${input.title}{/bold}`,
    });

    const textbox = blessed.textbox({
      parent: shell.content_box,
      top: 5,
      left: "center",
      width: "88%",
      height: 5,
      border: "line",
      label: ` ${input.secret
        ? t({ zh: "密文", en: "Secret" })
        : t({ zh: "输入", en: "Input" })} `,
      padding: { left: 1, right: 1, top: 1 },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      censor: input.secret,
      style: {
        border: { fg: "cyan" },
        fg: "white",
        bg: "black",
      },
    }) as blessed_textbox_element;

    const hint = blessed.box({
      parent: shell.content_box,
      top: 11,
      left: "center",
      width: "88%",
      height: 2,
      align: "center",
      content: input.placeholder
        ? `${t({ zh: "占位提示", en: "placeholder" })}: ${input.placeholder}`
        : "",
      style: {
        fg: "gray",
      },
    });

    const finish = (value: string | undefined): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      resolve(value);
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
      textbox.destroy();
      hint.destroy();
    };
    input.on_cleanup(cleanup);

    textbox.focus();
    textbox.readInput((error, value) => {
      if (error) {
        finish(undefined);
        return;
      }
      finish(normalize_textbox_value(value));
    });
    textbox.key(["escape", "C-c"], () => finish(undefined));
    textbox.key(["C-u"], () => {
      textbox.clearValue();
      shell.screen.render();
    });
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
        return;
      }
      if (text.includes("\u0015")) {
        textbox.clearValue();
        shell.screen.render();
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        setImmediate(() => submit_textbox_value(textbox, () => {
          finish(normalize_textbox_value(textbox.getValue()));
        }));
      }
    };
    process.stdin.on("data", raw_input_listener);
    shell.screen.render();
  });
}

export function resolve_selectable_index(
  options: admin_tui_select_option[],
  value: unknown,
  fallback: number,
): number {
  const candidate = clamp_selected_index(value, options.length, fallback);
  if (!is_disabled_option(options[candidate])) {
    return candidate;
  }

  const fallback_index = clamp_selected_index(fallback, options.length, 0);
  const direction = candidate >= fallback_index ? 1 : -1;
  const first_try = find_selectable_index(options, candidate, direction);
  if (first_try >= 0) return first_try;

  const second_try = find_selectable_index(options, candidate, direction * -1);
  if (second_try >= 0) return second_try;

  return candidate;
}

function find_selectable_index(
  options: admin_tui_select_option[],
  start_index: number,
  direction: number,
): number {
  let index = start_index + direction;
  while (index >= 0 && index < options.length) {
    if (!is_disabled_option(options[index])) {
      return index;
    }
    index += direction;
  }
  return -1;
}

export function next_breadcrumb_parts(current_parts: string[], section_title: string): string[] {
  const normalized_title = section_title.trim();
  if (!normalized_title) return current_parts;
  const existing_index = current_parts.indexOf(normalized_title);
  if (existing_index >= 0) {
    return current_parts.slice(0, existing_index + 1);
  }
  return [...current_parts, normalized_title];
}

export function clamp_selected_index(
  value: unknown,
  length: number,
  fallback: number,
): number {
  if (length <= 0) return 0;
  const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
  return Math.max(0, Math.min(length - 1, index));
}

export function get_key_name(key: unknown): string | undefined {
  if (!key || typeof key !== "object") return undefined;
  const candidate = key as { full?: unknown; name?: unknown };
  if (typeof candidate.full === "string") return candidate.full;
  if (typeof candidate.name === "string") return candidate.name;
  return undefined;
}

export function normalize_textbox_value(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}

export function submit_textbox_value(
  textbox: blessed_textbox_element,
  finish: () => void,
): void {
  if (textbox._done) {
    textbox._done("stop");
  }
  finish();
}
