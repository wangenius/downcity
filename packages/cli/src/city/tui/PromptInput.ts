/**
 * City TUI 输入类 prompt 实现。
 *
 * 关键点（中文）
 * - 覆盖 text / password / number 三种输入交互。
 * - 负责文本框创建、校验与 footer 提示。
 */

import blessed from "neo-blessed";
import { t } from "@/shared/CliLocale.js";
import {
  type blessed_textbox_element,
  create_prompt_shell,
  is_plain_escape_input,
  type PromptObject,
} from "@/city/tui/Prompts.js";

/**
 * 运行文本输入 prompt（含 password）。
 */
export async function run_text_prompt(
  question: PromptObject,
  options: { secret: boolean },
): Promise<string | undefined> {
  let error_message = "";

  while (true) {
    const submitted_value = await open_text_prompt_once(question, {
      secret: options.secret,
      error_message,
    });
    if (submitted_value === undefined) {
      return undefined;
    }

    const validated = await validate_prompt_value(question, submitted_value);
    if (validated === true) {
      return submitted_value;
    }
    error_message = validated;
  }
}

/**
 * 运行数字输入 prompt。
 */
export async function run_number_prompt(
  question: PromptObject,
): Promise<number | undefined> {
  let error_message = "";

  while (true) {
    const submitted_value = await open_text_prompt_once(question, {
      secret: false,
      error_message,
    });
    if (submitted_value === undefined) {
      return undefined;
    }

    const parsed_value = Number(submitted_value);
    if (!Number.isFinite(parsed_value)) {
      error_message = t({
        zh: "请输入有效数字",
        en: "Please enter a valid number",
      });
      continue;
    }
    if (typeof question.min === "number" && parsed_value < question.min) {
      error_message = t({
        zh: `最小值为 ${question.min}`,
        en: `Minimum value is ${question.min}`,
      });
      continue;
    }

    const validated = await validate_prompt_value(question, parsed_value);
    if (validated === true) {
      return parsed_value;
    }
    error_message = validated;
  }
}

async function open_text_prompt_once(
  question: PromptObject,
  options: {
    secret: boolean;
    error_message: string;
  },
): Promise<string | undefined> {
  const initial_value = String(question.initial ?? "");

  return await new Promise<string | undefined>((resolve) => {
    const shell = create_prompt_shell(question.message);
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const finish = (value: string | undefined): void => {
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
      content: question.message,
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
      label: ` ${options.secret
        ? t({ zh: "密文", en: "Secret" })
        : t({ zh: "输入", en: "Input" })} `,
      padding: { left: 1, right: 1, top: 1 },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      censor: options.secret,
      value: initial_value,
      style: {
        border: {
          fg: options.error_message ? "red" : "green",
        },
        fg: "white",
        bg: "black",
        focus: {
          border: {
            fg: options.error_message ? "red" : "green",
          },
        },
      },
    }) as blessed_textbox_element;

    const render_hint = (): void => {
      hint_box.setContent(options.error_message);
      screen.render();
    };

    shell.footer_box.setContent(text_footer_text(options.secret));

    screen.key(["escape", "C-c"], () => finish(undefined));
    textbox.key(["enter", "return"], () => {
      // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
      textbox.submit();
    });
    textbox.key(["escape", "C-c"], () => finish(undefined));
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
        finish(undefined);
        return;
      }
      finish(normalize_textbox_value(value));
    });

    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
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

async function validate_prompt_value(
  question: PromptObject,
  value: unknown,
): Promise<true | string> {
  if (!question.validate) {
    return true;
  }
  const result = await question.validate(value);
  return result === true
    ? true
    : String(result || t({ zh: "输入无效", en: "Invalid input" }));
}

function text_footer_text(secret: boolean): string {
  return secret
    ? t({
      zh: "输入密文 · Enter 提交 · Esc 取消 · Ctrl+U 清空",
      en: "Type secret · Enter submit · Esc cancel · Ctrl+U clear",
    })
    : t({
      zh: "输入文本 · Enter 提交 · Esc 取消 · Ctrl+U 清空",
      en: "Type text · Enter submit · Esc cancel · Ctrl+U clear",
    });
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
