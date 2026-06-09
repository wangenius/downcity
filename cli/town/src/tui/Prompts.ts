/**
 * Town 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 先覆盖当前仓库里实际使用到的 `select / multiselect / text / password / confirm / number`。
 * - 脚本模式仍由调用方自己兜底；这里默认只服务交互式 TTY 场景。
 */

import blessed from "neo-blessed";

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
  choices?: Array<{
    title?: string;
    label?: string;
    description?: string;
    hint?: string;
    value: unknown;
  }>;

  /** 初始值。 */
  initial?: unknown;

  /** 输入校验。 */
  validate?: (value: any) => true | string;

  /** 最小值。 */
  min?: number;
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
  setItems: (items: blessed.Widgets.ListElementItem[]) => void;
  selected?: number;
}

interface prompt_result_map {
  [key: string]: unknown;
}

/**
 * Town 使用的 prompts 默认导出。
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

async function run_select_prompt(
  question: PromptObject,
): Promise<unknown> {
  const choices = question.choices ?? [];
  const initial_index = normalize_initial_index(question.initial, choices.length);

  return await new Promise<unknown>((resolve) => {
    const screen = create_screen(question.message);
    let finished = false;

    const finish = (value: unknown): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: screen,
      top: 0,
      left: 0,
      width: "42%",
      height: "100%-3",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Select ",
      style: build_list_style(),
      items: choices.map((item) => format_choice_title(item)),
    }) as blessed_list_element;

    const detail = blessed.box({
      parent: screen,
      top: 0,
      left: "42%",
      width: "58%",
      height: "100%-3",
      border: "line",
      label: " Detail ",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      content: format_choice_detail(choices[initial_index]),
      style: {
        border: { fg: "green" },
      },
    });

    create_footer(screen, "Enter choose · Esc cancel · ↑↓ / j k navigate");

    list.select(initial_index);
    list.focus();

    list.on("select item", (_item, index_value) => {
      const index: number = typeof index_value === "number" ? index_value : 0;
      detail.setContent(format_choice_detail(choices[index]));
      screen.render();
    });

    list.key(["enter"], () => {
      const index = typeof list.selected === "number" ? list.selected : initial_index;
      finish(choices[index]?.value);
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    screen.render();
  });
}

async function run_multiselect_prompt(
  question: PromptObject,
): Promise<unknown[] | undefined> {
  const choices = question.choices ?? [];
  const selected_indexes = new Set<number>();
  let current_index = normalize_initial_index(question.initial, choices.length);

  return await new Promise<unknown[] | undefined>((resolve) => {
    const screen = create_screen(question.message);
    let finished = false;

    const finish = (value: unknown[] | undefined): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: screen,
      top: 0,
      left: 0,
      width: "42%",
      height: "100%-3",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Multi Select ",
      style: build_list_style(),
      items: build_multiselect_items(choices, selected_indexes),
    }) as blessed_list_element;

    const detail = blessed.box({
      parent: screen,
      top: 0,
      left: "42%",
      width: "58%",
      height: "100%-3",
      border: "line",
      label: " Detail ",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      content: format_choice_detail(choices[current_index]),
      style: {
        border: { fg: "green" },
      },
    });

    create_footer(screen, "Space toggle · Enter confirm · Esc cancel · ↑↓ / j k navigate");

    const sync_list = (): void => {
      list.setItems(build_multiselect_items(choices, selected_indexes));
      list.select(current_index);
      detail.setContent(format_choice_detail(choices[current_index]));
      screen.render();
    };

    list.select(current_index);
    list.focus();

    list.on("select item", (_item, index_value) => {
      current_index = typeof index_value === "number" ? index_value : current_index;
      detail.setContent(format_choice_detail(choices[current_index]));
      screen.render();
    });

    list.key(["space"], () => {
      if (selected_indexes.has(current_index)) {
        selected_indexes.delete(current_index);
      } else {
        selected_indexes.add(current_index);
      }
      sync_list();
    });

    list.key(["enter"], () => {
      const values = [...selected_indexes]
        .sort((left, right) => left - right)
        .map((index) => choices[index]?.value)
        .filter((value) => value !== undefined);
      finish(values);
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    screen.render();
  });
}

async function run_confirm_prompt(
  question: PromptObject,
): Promise<boolean | undefined> {
  const initial_value = question.initial === true;
  const choices = [
    {
      title: "Yes",
      description: "Confirm this action",
      value: true,
    },
    {
      title: "No",
      description: "Cancel and go back",
      value: false,
    },
  ];

  return await new Promise<boolean | undefined>((resolve) => {
    const screen = create_screen(question.message);
    let finished = false;

    const finish = (value: boolean | undefined): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: screen,
      top: "center",
      left: "center",
      width: "60%",
      height: 8,
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Confirm ",
      style: build_list_style(),
      items: choices.map((item) => item.title),
    }) as blessed_list_element;

    const note = blessed.box({
      parent: screen,
      top: "center-6",
      left: "center",
      width: "60%",
      height: 3,
      tags: true,
      align: "center",
      content: question.message,
    });

    create_footer(screen, "Enter choose · Esc cancel");

    list.select(initial_value ? 0 : 1);
    list.focus();

    list.key(["enter"], () => {
      const index = typeof list.selected === "number" ? list.selected : (initial_value ? 0 : 1);
      note.setContent(choices[index]?.description || question.message);
      finish(Boolean(choices[index]?.value));
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    screen.render();
  });
}

async function run_text_prompt(
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

async function run_number_prompt(
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
      error_message = "Please enter a valid number";
      continue;
    }
    if (typeof question.min === "number" && parsed_value < question.min) {
      error_message = `Minimum value is ${question.min}`;
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
    const screen = create_screen(question.message);
    let finished = false;

    const finish = (value: string | undefined): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    blessed.box({
      parent: screen,
      top: "center-6",
      left: "center",
      width: "70%",
      height: 3,
      align: "center",
      tags: true,
      content: question.message,
    });

    blessed.box({
      parent: screen,
      top: "center-3",
      left: "center",
      width: "70%",
      height: 5,
      border: "line",
      label: options.secret ? " Secret " : " Input ",
      style: {
        border: {
          fg: options.error_message ? "red" : "green",
        },
      },
    });

    if (options.error_message) {
      blessed.box({
        parent: screen,
        top: "center+2",
        left: "center",
        width: "70%",
        height: 2,
        align: "center",
        style: {
          fg: "red",
        },
        content: options.error_message,
      });
    }

    const input = blessed.textbox({
      parent: screen,
      top: "center-2",
      left: "center-34%",
      width: "66%",
      height: 1,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      censor: options.secret,
      style: {
        fg: "white",
        bg: "black",
      },
      value: initial_value,
    });

    create_footer(screen, "Enter submit · Esc cancel");

    input.focus();
    input.readInput((error, value) => {
      if (error) {
        finish(undefined);
        return;
      }
      finish(String(value ?? ""));
    });

    screen.key(["escape", "C-c"], () => finish(undefined));
    screen.render();
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
  return result === true ? true : String(result || "Invalid input");
}

function create_screen(title: string): blessed.Widgets.Screen {
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

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: "line",
    padding: { left: 1, top: 1 },
    content: `{bold}${title}{/bold}`,
    style: {
      border: { fg: "green" },
    },
  });

  return screen;
}

function create_footer(
  screen: blessed.Widgets.Screen,
  content: string,
): void {
  blessed.box({
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
    content,
  });
}

function build_list_style(): blessed.Widgets.ListOptions["style"] {
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

function format_choice_title(choice?: {
  title?: string;
  label?: string;
  description?: string;
  hint?: string;
}): string {
  const title = String(choice?.title ?? choice?.label ?? "").trim();
  const hint = String(choice?.description ?? choice?.hint ?? "").trim();
  return hint ? `${title}\n${hint}` : title;
}

function format_choice_detail(choice?: {
  title?: string;
  label?: string;
  description?: string;
  hint?: string;
  value?: unknown;
}): string {
  if (!choice) {
    return "No item selected";
  }

  const title = String(choice.title ?? choice.label ?? "").trim();
  const hint = String(choice.description ?? choice.hint ?? "").trim();
  const value = choice.value === undefined ? "" : String(choice.value);

  return [
    `{bold}${title}{/bold}`,
    hint,
    value ? `\nvalue: ${value}` : "",
  ].filter(Boolean).join("\n");
}

function build_multiselect_items(
  choices: Array<{
    title?: string;
    label?: string;
    description?: string;
    hint?: string;
  }>,
  selected_indexes: Set<number>,
): string[] {
  return choices.map((choice, index) => {
    const checked = selected_indexes.has(index) ? "[x]" : "[ ]";
    const title = String(choice.title ?? choice.label ?? "").trim();
    const hint = String(choice.description ?? choice.hint ?? "").trim();
    return hint ? `${checked} ${title}\n${hint}` : `${checked} ${title}`;
  });
}

function normalize_initial_index(
  initial: unknown,
  length: number,
): number {
  if (length <= 0) {
    return 0;
  }
  const numeric_value = Number(initial);
  if (!Number.isInteger(numeric_value) || numeric_value < 0) {
    return 0;
  }
  return Math.min(length - 1, numeric_value);
}
