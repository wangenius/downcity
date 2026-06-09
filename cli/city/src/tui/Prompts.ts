/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `@clack/prompts` 常用能力。
 * - 先覆盖当前 City CLI 实际使用到的 `select / text / password / confirm`。
 * - 选择类问题统一在左侧 sidebar，右侧 main_section 只展示详情或输入。
 * - 保持返回约定尽量接近 clack，便于渐进替换现有流程。
 */

import blessed from "neo-blessed";
import { create_city_tui_shell } from "./Shell.js";

interface prompt_select_option {
  label: string;
  value: unknown;
  hint?: string;
}

interface prompt_select_input {
  message: string;
  options: prompt_select_option[];
}

interface prompt_text_input {
  message: string;
  initialValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | true | undefined;
}

interface prompt_confirm_input {
  message: string;
  initialValue?: boolean;
}

interface blessed_list_element extends blessed.Widgets.ListElement {
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  focus: () => void;
  select: (index: number) => void;
  selected?: number;
}

interface blessed_textbox_element extends blessed.Widgets.TextboxElement {
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_textbox_element;
  focus: () => void;
  readInput: (callback: (error: Error | null, value?: string) => void) => void;
  submit: () => void;
  _done?: (error: Error | string | null, value?: string | null) => void;
  clearValue: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
}

/**
 * clack 兼容：select。
 */
export async function select(
  input: prompt_select_input,
): Promise<unknown> {
  return await new Promise<unknown>((resolve) => {
    const shell = create_city_tui_shell({
      screen_title: input.message,
      breadcrumb: input.message,
      main_label: "Main",
      footer: "Enter choose · Esc cancel · ↑↓ / j k navigate",
    });
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const finish = (value: unknown): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: shell.sidebar_box,
      top: 2,
      left: 0,
      width: "100%",
      height: "100%-2",
      keys: true,
      vi: true,
      mouse: true,
      style: build_list_style(),
      items: input.options.map((item) => item.label),
    }) as blessed_list_element;

    const detail = blessed.box({
      parent: shell.main_box,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      content: format_option_detail(input.options[0]),
      style: {
        fg: "white",
      },
    });

    list.select(0);
    list.focus();

    list.on("select item", (_item, index_value) => {
      const index = typeof index_value === "number" ? index_value : 0;
      detail.setContent(format_option_detail(input.options[index]));
      screen.render();
    });

    list.key(["enter"], () => {
      const index = typeof list.selected === "number" ? list.selected : 0;
      finish(input.options[index]?.value);
    });

    screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(cancel("cancel"));
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        const index = typeof list.selected === "number" ? list.selected : 0;
        finish(input.options[index]?.value);
      }
    };
    process.stdin.on("data", raw_input_listener);
    screen.render();
  });
}

/**
 * clack 兼容：text。
 */
export async function text(
  input: prompt_text_input,
): Promise<unknown> {
  return await run_text_prompt(input, false);
}

/**
 * clack 兼容：password。
 */
export async function password(
  input: prompt_text_input,
): Promise<unknown> {
  return await run_text_prompt(input, true);
}

/**
 * clack 兼容：confirm。
 */
export async function confirm(
  input: prompt_confirm_input,
): Promise<unknown> {
  const initial_value = input.initialValue === true;
  const options = [
    {
      label: "Yes",
      value: true,
      hint: "Confirm this action",
    },
    {
      label: "No",
      value: false,
      hint: "Cancel and go back",
    },
  ];

  return await new Promise<unknown>((resolve) => {
    const shell = create_city_tui_shell({
      screen_title: input.message,
      breadcrumb: input.message,
      main_label: "Main",
      footer: "Enter choose · Esc cancel",
    });
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const finish = (value: unknown): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: shell.sidebar_box,
      top: 2,
      left: 0,
      width: "100%",
      height: "100%-2",
      keys: true,
      vi: true,
      mouse: true,
      style: build_list_style(),
      items: options.map((item) => item.label),
    }) as blessed_list_element;

    const detail = blessed.box({
      parent: shell.main_box,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      tags: true,
      content: format_option_detail(options[initial_value ? 0 : 1]),
    });

    list.select(initial_value ? 0 : 1);
    list.focus();
    list.on("select item", (_item, index_value) => {
      const index = typeof index_value === "number" ? index_value : 0;
      detail.setContent(format_option_detail(options[index]));
      screen.render();
    });

    list.key(["enter"], () => {
      const index = typeof list.selected === "number" ? list.selected : (initial_value ? 0 : 1);
      finish(options[index]?.value);
    });

    screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(cancel("cancel"));
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        const index = typeof list.selected === "number" ? list.selected : (initial_value ? 0 : 1);
        finish(options[index]?.value);
      }
    };
    process.stdin.on("data", raw_input_listener);
    screen.render();
  });
}

/**
 * clack 兼容：isCancel。
 */
export function isCancel(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "__clack_cancel" in value,
  );
}

/**
 * clack 兼容：intro。
 */
export function intro(_message: string): void {
  // 关键点（中文）：TUI 模式下不再额外打印 intro，避免和全屏界面冲突。
}

/**
 * clack 兼容：log。
 */
export const log = {
  info(message: string): void {
    console.log(message);
  },
  error(message: string): void {
    console.error(message);
  },
  success(message: string): void {
    console.log(message);
  },
};

async function run_text_prompt(
  input: prompt_text_input,
  secret: boolean,
): Promise<unknown> {
  let error_message = "";

  while (true) {
    const submitted_value = await open_text_prompt_once(input, {
      secret,
      error_message,
    });

    if (isCancel(submitted_value)) {
      return submitted_value;
    }

    const normalized_value = String(submitted_value ?? "");
    if (!input.validate) {
      return normalized_value;
    }

    const validate_result = input.validate(normalized_value);
    if (validate_result === true || validate_result === undefined) {
      return normalized_value;
    }
    error_message = String(validate_result || "Invalid input");
  }
}

async function open_text_prompt_once(
  input: prompt_text_input,
  options: {
    secret: boolean;
    error_message: string;
  },
): Promise<unknown> {
  return await new Promise<unknown>((resolve) => {
    const shell = create_city_tui_shell({
      screen_title: input.message,
      breadcrumb: input.message,
      main_label: "Main",
      footer: "Type text · Enter submit · Esc cancel · Ctrl+U clear",
    });
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const finish = (value: unknown): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      screen.destroy();
      resolve(value);
    };

    blessed.box({
      parent: shell.main_box,
      top: 4,
      left: "center",
      width: "70%",
      height: 3,
      align: "center",
      tags: true,
      content: input.message,
    });

    const hint_box = blessed.box({
      parent: shell.main_box,
      top: 14,
      left: "center",
      width: "70%",
      height: 2,
      align: "center",
      tags: true,
      style: {
        fg: options.error_message ? "red" : "gray",
      },
    });

    const textbox = blessed.textbox({
      parent: shell.main_box,
      top: 8,
      left: "center",
      width: "70%",
      height: 5,
      border: "line",
      label: options.secret ? " Secret " : " Input ",
      padding: { left: 1, right: 1, top: 1 },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      censor: options.secret,
      value: String(input.initialValue ?? ""),
      style: {
        border: { fg: options.error_message ? "red" : "cyan" },
        fg: "white",
        bg: "black",
        focus: {
          border: { fg: options.error_message ? "red" : "cyan" },
        },
      },
    }) as blessed_textbox_element;

    const render_hint = (): void => {
      hint_box.setContent(options.error_message || format_input_hint(input.placeholder));
      screen.render();
    };

    screen.key(["escape", "C-c"], () => finish(cancel("cancel")));
    textbox.key(["enter", "return"], () => {
      // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
      textbox.submit();
    });
    textbox.key(["escape", "C-c"], () => finish(cancel("cancel")));
    screen.key(["C-u"], () => {
      textbox.clearValue();
      screen.render();
    });
    textbox.key(["C-u"], () => {
      textbox.clearValue();
      screen.render();
    });

    textbox.focus();
    render_hint();
    textbox.readInput((error, value) => {
      if (error) {
        finish(cancel("cancel"));
        return;
      }
      finish(normalize_textbox_value(value));
    });

    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(cancel("cancel"));
        return;
      }
      if (text.includes("\u0015")) {
        textbox.clearValue();
        screen.render();
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        // 关键点（中文）：部分终端的回车不会触发 blessed 的 enter/return，延后一拍读取最新值。
        setImmediate(() => submit_textbox_value(textbox, () => {
          finish(normalize_textbox_value(textbox.getValue()));
        }));
      }
    };
    process.stdin.on("data", raw_input_listener);
  });
}

function build_list_style(): blessed.Widgets.ListOptions["style"] {
  return {
    border: { fg: "cyan" },
    item: { fg: "white" },
    selected: {
      fg: "black",
      bg: "cyan",
      bold: true,
    },
  };
}

function format_option_detail(option?: prompt_select_option): string {
  if (!option) {
    return "No item selected";
  }

  return [
    `{bold}${option.label}{/bold}`,
    option.hint ? option.hint : "",
    option.value !== undefined ? `\nvalue: ${String(option.value)}` : "",
  ].filter(Boolean).join("\n");
}

function format_input_hint(placeholder?: string): string {
  const text = String(placeholder ?? "").trim();
  return text ? `placeholder: ${text}` : "";
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

function cancel(reason: string): { __clack_cancel: true; reason: string } {
  return {
    __clack_cancel: true,
    reason,
  };
}
