/**
 * City TUI 选择类 prompt 实现。
 *
 * 关键点（中文）
 * - 覆盖 select / multiselect / confirm 三种选择交互。
 * - 统一左侧 sidebar 展示选项，右侧主区域展示详情。
 */

import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import {
  type blessed_list_element,
  build_list_style,
  create_prompt_shell,
  is_plain_escape_input,
  type PromptObject,
  type prompt_choice,
} from "./Prompts.js";

/**
 * 运行单选 prompt。
 */
export async function run_select_prompt(
  question: PromptObject,
): Promise<unknown> {
  const choices = question.choices ?? [];
  const initial_index = resolve_selectable_index(
    choices,
    normalize_initial_index(question.initial, choices.length),
    0,
  );

  return await new Promise<unknown>((resolve) => {
    const shell = create_prompt_shell(question.message);
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;
    let selected_index = initial_index;

    const finish = (value: unknown): void => {
      if (finished) return;
      finished = true;
      cleanup();
      screen.destroy();
      resolve(value);
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
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
      items: choices.map(format_choice_sidebar_label),
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
      content: format_choice_detail(choices[initial_index]),
      style: {
        fg: "white",
      },
    });

    const sync_selection = (index_value: unknown = list.selected): void => {
      selected_index = resolve_selectable_index(choices, index_value, selected_index);
      if (list.selected !== selected_index) {
        list.select(selected_index);
      }
      detail.setContent(format_choice_detail(choices[selected_index]));
      shell.footer_box.setContent(format_select_footer(choices[selected_index]));
      screen.render();
    };

    shell.footer_box.setContent(select_footer_text());

    list.select(initial_index);
    list.focus();

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.on("keypress", () => {
      // 关键点（中文）：焦点移动时同步详情区和 footer，避免描述只在确认后才出现。
      setImmediate(() => {
        if (finished) return;
        sync_selection();
      });
    });

    list.key(["enter"], () => {
      sync_selection();
      if (is_disabled_choice(choices[selected_index])) {
        return;
      }
      finish(choices[selected_index]?.value);
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        sync_selection();
        if (is_disabled_choice(choices[selected_index])) {
          return;
        }
        finish(choices[selected_index]?.value);
      }
    };
    process.stdin.on("data", raw_input_listener);
    sync_selection(selected_index);
    screen.render();
  });
}

/**
 * 运行多选 prompt。
 */
export async function run_multiselect_prompt(
  question: PromptObject,
): Promise<unknown[] | undefined> {
  const choices = question.choices ?? [];
  const selected_indexes = new Set<number>();
  let current_index = resolve_selectable_index(
    choices,
    normalize_initial_index(question.initial, choices.length),
    0,
  );

  return await new Promise<unknown[] | undefined>((resolve) => {
    const shell = create_prompt_shell(question.message);
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const finish = (value: unknown[] | undefined): void => {
      if (finished) return;
      finished = true;
      cleanup();
      screen.destroy();
      resolve(value);
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
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
      items: build_multiselect_items(choices, selected_indexes),
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
      content: format_choice_detail(choices[current_index]),
      style: {
        fg: "white",
      },
    });

    shell.footer_box.setContent(multiselect_footer_text());

    const sync_list = (): void => {
      list.setItems(build_multiselect_items(choices, selected_indexes));
      list.select(current_index);
      detail.setContent(format_choice_detail(choices[current_index]));
      shell.footer_box.setContent(format_multiselect_footer(choices[current_index]));
      screen.render();
    };

    const sync_selection = (index_value: unknown = list.selected): void => {
      current_index = resolve_selectable_index(choices, index_value, current_index);
      if (list.selected !== current_index) {
        list.select(current_index);
      }
      detail.setContent(format_choice_detail(choices[current_index]));
      shell.footer_box.setContent(format_multiselect_footer(choices[current_index]));
      screen.render();
    };

    list.select(current_index);
    list.focus();

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.on("keypress", () => {
      // 关键点（中文）：多选移动焦点时也要同步右侧说明。
      setImmediate(() => {
        if (finished) return;
        sync_selection();
      });
    });

    list.key(["space"], () => {
      sync_selection();
      if (is_disabled_choice(choices[current_index])) {
        return;
      }
      if (selected_indexes.has(current_index)) {
        selected_indexes.delete(current_index);
      } else {
        selected_indexes.add(current_index);
      }
      sync_list();
    });

    list.key(["enter"], () => {
      sync_selection();
      finish(build_multiselect_values(choices, selected_indexes));
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
        return;
      }
      if (text.includes(" ")) {
        sync_selection();
        if (is_disabled_choice(choices[current_index])) {
          return;
        }
        if (selected_indexes.has(current_index)) {
          selected_indexes.delete(current_index);
        } else {
          selected_indexes.add(current_index);
        }
        sync_list();
      }
      if (text.includes("\r") || text.includes("\n")) {
        finish(build_multiselect_values(choices, selected_indexes));
      }
    };
    process.stdin.on("data", raw_input_listener);
    sync_selection(current_index);
    screen.render();
  });
}

/**
 * 运行确认 prompt。
 */
export async function run_confirm_prompt(
  question: PromptObject,
): Promise<boolean | undefined> {
  const initial_value = question.initial === true;
  const choices = [
    {
      title: t({ zh: "是", en: "Yes" }),
      description: t({
        zh: "确认执行该动作",
        en: "Confirm this action",
      }),
      value: true,
    },
    {
      title: t({ zh: "否", en: "No" }),
      description: t({
        zh: "取消并返回",
        en: "Cancel and go back",
      }),
      value: false,
    },
  ];

  return await new Promise<boolean | undefined>((resolve) => {
    const shell = create_prompt_shell(question.message);
    const { screen } = shell;
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;
    let selected_index = initial_value ? 0 : 1;

    const finish = (value: boolean | undefined): void => {
      if (finished) return;
      finished = true;
      cleanup();
      screen.destroy();
      resolve(value);
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
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
      items: choices.map(format_choice_sidebar_label),
    }) as blessed_list_element;

    const note = blessed.box({
      parent: shell.main_box,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      tags: true,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      content: format_choice_detail(choices[initial_value ? 0 : 1]),
    });

    const sync_selection = (index_value: unknown = list.selected): void => {
      selected_index = clamp_selected_index(index_value, choices.length, selected_index);
      note.setContent(format_choice_detail(choices[selected_index]));
      shell.footer_box.setContent(format_confirm_footer(choices[selected_index]));
      screen.render();
    };

    shell.footer_box.setContent(confirm_footer_text());

    list.select(initial_value ? 0 : 1);
    list.focus();

    list.key(["enter"], () => {
      sync_selection();
      finish(Boolean(choices[selected_index]?.value));
    });

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.on("keypress", () => {
      // 关键点（中文）：焦点移动时同步详情区和 footer，避免描述只在确认后才出现。
      setImmediate(() => {
        if (finished) return;
        sync_selection();
      });
    });

    screen.key(["escape", "q", "C-c"], () => finish(undefined));
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || is_plain_escape_input(text)) {
        finish(undefined);
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        finish(Boolean(choices[selected_index]?.value));
      }
    };
    process.stdin.on("data", raw_input_listener);
    sync_selection(selected_index);
    screen.render();
  });
}

function format_choice_label(choice?: {
  title?: string;
  label?: string;
}): string {
  return String(choice?.title ?? choice?.label ?? "").trim();
}

function format_choice_sidebar_label(choice?: {
  title?: string;
  label?: string;
  description?: string;
  hint?: string;
  disabled?: boolean;
}): string {
  if (is_disabled_choice(choice)) {
    return `── ${format_choice_label(choice)} ──`;
  }
  return format_choice_label(choice);
}

function format_choice_detail(choice?: prompt_choice): string {
  if (!choice) {
    return t({
      zh: "未选择项目",
      en: "No item selected",
    });
  }

  const title = String(choice.title ?? choice.label ?? "").trim();
  if (is_disabled_choice(choice)) {
    return [
      `{bold}${title}{/bold}`,
      t({
        zh: "这是侧边栏分区标题，用于区分当前菜单里的操作区域。",
        en: "This is a sidebar section heading used to group actions in the current menu.",
      }),
    ].join("\n");
  }

  const hint = choice_description(choice);
  const value = format_display_value(choice.value);

  return [
    `{bold}${title}{/bold}`,
    hint,
    value ? `\n${t({ zh: "值", en: "value" })}: ${value}` : "",
  ].filter(Boolean).join("\n");
}

function choice_description(choice?: {
  title?: string;
  label?: string;
  description?: string;
  hint?: string;
  disabled?: boolean;
}): string {
  if (is_disabled_choice(choice)) {
    return "";
  }
  const hint = String(choice?.description ?? choice?.hint ?? "").trim();
  if (hint) return hint;
  const title = format_choice_label(choice);
  return t({
    zh: `选择 ${title}`,
    en: `Select ${title}`,
  });
}

function format_display_value(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function select_footer_text(): string {
  return t({
    zh: "Enter 选择 · Esc 取消 · ↑↓ / j k 切换",
    en: "Enter choose · Esc cancel · ↑↓ / j k navigate",
  });
}

function format_select_footer(choice: prompt_choice | undefined): string {
  if (!choice) return select_footer_text();
  if (is_disabled_choice(choice)) return select_footer_text();
  return `${select_footer_text()} · ${choice_description(choice)}`;
}

function multiselect_footer_text(): string {
  return t({
    zh: "Space 切换 · Enter 确认 · Esc 取消 · ↑↓ / j k 切换",
    en: "Space toggle · Enter confirm · Esc cancel · ↑↓ / j k navigate",
  });
}

function format_multiselect_footer(choice: prompt_choice | undefined): string {
  if (!choice) return multiselect_footer_text();
  if (is_disabled_choice(choice)) return multiselect_footer_text();
  return `${multiselect_footer_text()} · ${choice_description(choice)}`;
}

function confirm_footer_text(): string {
  return t({
    zh: "Enter 选择 · Esc 取消",
    en: "Enter choose · Esc cancel",
  });
}

function format_confirm_footer(choice: prompt_choice | undefined): string {
  if (!choice) return confirm_footer_text();
  if (is_disabled_choice(choice)) return confirm_footer_text();
  return `${confirm_footer_text()} · ${choice_description(choice)}`;
}

function build_multiselect_items(
  choices: prompt_choice[],
  selected_indexes: Set<number>,
): string[] {
  return choices.map((choice, index) => {
    if (is_disabled_choice(choice)) {
      return format_choice_sidebar_label(choice);
    }
    const checked = selected_indexes.has(index) ? "[x]" : "[ ]";
    return `${checked} ${format_choice_label(choice)}`;
  });
}

function build_multiselect_values(
  choices: prompt_choice[],
  selected_indexes: Set<number>,
): unknown[] {
  return [...selected_indexes]
    .sort((left, right) => left - right)
    .filter((index) => !is_disabled_choice(choices[index]))
    .map((index) => choices[index]?.value)
    .filter((value) => value !== undefined);
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

function clamp_selected_index(
  value: unknown,
  length: number,
  fallback: number,
): number {
  if (length <= 0) return 0;
  const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
  return Math.max(0, Math.min(length - 1, index));
}

function is_disabled_choice(choice: {
  disabled?: boolean;
} | undefined): boolean {
  return choice?.disabled === true;
}

function resolve_selectable_index(
  choices: prompt_choice[],
  value: unknown,
  fallback: number,
): number {
  if (choices.length <= 0) return 0;
  const candidate = clamp_selected_index(value, choices.length, fallback);
  if (!is_disabled_choice(choices[candidate])) {
    return candidate;
  }

  const direction = candidate >= fallback ? 1 : -1;
  const first_try = find_selectable_index(choices, candidate, direction);
  if (first_try !== -1) return first_try;

  const second_try = find_selectable_index(choices, candidate, direction * -1);
  if (second_try !== -1) return second_try;

  return candidate;
}

function find_selectable_index(
  choices: prompt_choice[],
  start_index: number,
  direction: number,
): number {
  let index = start_index;
  while (index >= 0 && index < choices.length) {
    if (!is_disabled_choice(choices[index])) {
      return index;
    }
    index += direction;
  }
  return -1;
}
