/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 本模块暴露类型、入口与公共 shell；具体 select / multiselect / confirm 在 PromptSelect.ts，
 *   text / number / password 在 PromptInput.ts。
 */

import blessed from "neo-blessed";
import { t } from "@/shared/CliLocale.js";
import {
  run_confirm_prompt,
  run_multiselect_prompt,
  run_select_prompt,
} from "@/city/tui/PromptSelect.js";
import { run_number_prompt, run_text_prompt } from "@/city/tui/PromptInput.js";

/**
 * 单个问题的最小兼容类型。
 */
export interface PromptObject {
  /** 问题类型。 */
  type: "select" | "multiselect" | "text" | "password" | "confirm" | "number";

  /** 结果字段名。 */
  name: string;

  /** 问题标题。 */
  message: string;

  /** 选项列表。 */
  choices?: prompt_choice_option[];

  /** 初始值。 */
  initial?: unknown;

  /** 输入校验。 */
  validate?: (value: any) => true | string;

  /** 最小值。 */
  min?: number;
}

/**
 * 选择类 Prompt 的单个选项。
 */
export interface prompt_choice_option {
  /** 左侧 sidebar 展示标题。 */
  title?: string;

  /** 兼容旧调用方的展示标签。 */
  label?: string;

  /** 当前选项聚焦时展示在 main/footer 的说明。 */
  description?: string;

  /** 兼容旧调用方的说明文本。 */
  hint?: string;

  /** 选中后返回给调用方的业务值。 */
  value?: unknown;

  /**
   * 是否仅作为分区标题展示。
   *
   * 关键点（中文）
   * - true 时该项只负责分隔 sidebar，不参与选择与多选勾选。
   * - TUI 会自动跳过该项，避免 Enter 返回无意义值。
   */
  disabled?: boolean;
}

export interface blessed_list_element extends blessed.Widgets.ListElement {
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  removeListener: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  focus: () => void;
  select: (index: number) => void;
  setItems: (items: blessed.Widgets.ListElementItem[]) => void;
  selected?: number;
}

export interface blessed_textbox_element extends blessed.Widgets.TextboxElement {
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

export interface prompt_shell {
  /** blessed 全屏根节点。 */
  screen: blessed.Widgets.Screen;

  /** 左侧 sidebar 容器。 */
  sidebar_box: blessed.Widgets.BoxElement;

  /** 右侧主内容区。 */
  main_box: blessed.Widgets.BoxElement;

  /** 底部操作提示区。 */
  footer_box: blessed.Widgets.BoxElement;
}

interface prompt_result_map {
  [key: string]: unknown;
}

export type prompt_choice = NonNullable<PromptObject["choices"]>[number];

/**
 * City 使用的 prompts 默认导出。
 */
export default async function prompts(
  input: PromptObject | PromptObject[],
): Promise<prompt_result_map> {
  const questions = Array.isArray(input) ? input : [input];
  const answers: prompt_result_map = {};

  for (const question of questions) {
    const value = await run_prompt_question(question);
    if (value === undefined) {
      return answers;
    }
    answers[question.name] = value;
  }

  return answers;
}

async function run_prompt_question(
  question: PromptObject,
): Promise<unknown> {
  if (question.type === "select") {
    return await run_select_prompt(question);
  }
  if (question.type === "multiselect") {
    return await run_multiselect_prompt(question);
  }
  if (question.type === "confirm") {
    return await run_confirm_prompt(question);
  }
  if (question.type === "password") {
    return await run_text_prompt(question, { secret: true });
  }
  if (question.type === "number") {
    return await run_number_prompt(question);
  }
  return await run_text_prompt(question, { secret: false });
}

/**
 * 创建 prompt 全屏 shell。
 */
export function create_prompt_shell(title: string): prompt_shell {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title,
    dockBorders: true,
    autoPadding: true,
  });

  screen.style = {
    bg: "black",
    fg: "white",
  };

  const sidebar_box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "34%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "侧边栏", en: "Sidebar" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  blessed.box({
    parent: sidebar_box,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 2,
    content: format_breadcrumb(title),
    style: {
      fg: "green",
      bold: true,
    },
  });

  const main_box = blessed.box({
    parent: screen,
    top: 0,
    left: "34%",
    width: "66%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "主区域", en: "Main" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  const footer_box = blessed.box({
    parent: screen,
    left: 0,
    bottom: 0,
    width: "100%",
    height: 3,
    border: "line",
    padding: { left: 1, top: 1 },
    style: {
      border: { fg: "green" },
      fg: "gray",
    },
    content: "",
  });

  return {
    screen,
    sidebar_box,
    main_box,
    footer_box,
  };
}

/**
 * 构建列表样式。
 */
export function build_list_style(): blessed.Widgets.ListOptions["style"] {
  return {
    border: { fg: "green" },
    item: { fg: "white" },
    selected: {
      fg: "black",
      bg: "green",
      bold: true,
    },
  };
}

/**
 * 判断是否为纯 Esc 输入。
 */
export function is_plain_escape_input(text: string): boolean {
  return text === "\u001b";
}

function format_breadcrumb(value: string): string {
  return value.padEnd(80, " ");
}
