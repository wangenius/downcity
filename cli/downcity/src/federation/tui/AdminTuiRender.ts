/**
 * Admin TUI 渲染辅助模块。
 *
 * 关键点（中文）
 * - 负责选项列表、内容区、loading、消息、表格的渲染。
 * - 不处理输入循环，只根据数据刷新屏幕。
 */

import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import {
  type blessed_box_element,
  format_breadcrumb,
  is_plain_escape_input,
  type shell_layout,
} from "./AdminTuiShell.js";
import type {
  admin_tui_message_kind,
  admin_tui_select_option,
  admin_tui_table_input,
} from "../types/AdminTui.js";

/**
 * 渲染侧边栏选项列表。
 */
export function render_nav(
  shell: shell_layout,
  title: string,
  options: admin_tui_select_option[],
  selected_index: number,
): void {
  shell.breadcrumb_box.setContent(format_breadcrumb(title));
  shell.nav_list.setItems(options.map(format_sidebar_option));
  shell.nav_list.select(selected_index);
  render_sidebar_hint(shell, options, selected_index);
  shell.screen.render();
}

/**
 * 渲染当前选项详情到内容区。
 */
export function render_option_detail(
  shell: shell_layout,
  title: string,
  option: admin_tui_select_option | undefined,
): void {
  shell.content_box.setLabel(` ${t({ zh: "内容", en: "Section" })} `);
  shell.content_box.children.slice().forEach((child) => child.destroy());
  blessed.box({
    parent: shell.content_box,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    padding: { left: 1, right: 1, top: 1, bottom: 1 },
    tags: true,
    content: format_option_detail(title, option),
    style: {
      fg: "white",
    },
  });
  shell.screen.render();
}

/**
 * 渲染 loading 状态。
 */
export function render_loading(shell: shell_layout, title: string): void {
  shell.content_box.setLabel(` ${title} `);
  blessed.box({
    parent: shell.content_box,
    top: "center",
    left: "center",
    width: "80%",
    height: 5,
    align: "center",
    valign: "middle",
    border: "line",
    content: t({
      zh: `正在加载 ${title}...`,
      en: `Loading ${title}...`,
    }),
    style: {
      border: { fg: "cyan" },
      fg: "white",
    },
  });
}

/**
 * 在内容区展示一段文本。
 */
export async function show_content(
  shell: shell_layout,
  input: {
    title: string;
    content: string;
    accent: "cyan" | "green" | "red";
    on_cleanup: (cleanup: () => void) => void;
  },
): Promise<void> {
  return await new Promise<void>((resolve) => {
    shell.content_box.children.slice().forEach((child) => child.destroy());
    shell.content_box.setLabel(` ${input.title} `);
    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;

    const content_box = blessed.box({
      parent: shell.content_box,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      tags: false,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      content: input.content || t({ zh: "（空）", en: "(empty)" }),
      style: {
        fg: "white",
        border: { fg: input.accent },
      },
    }) as blessed_box_element;

    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      resolve();
    };

    const cleanup = (): void => {
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
        raw_input_listener = undefined;
      }
      content_box.destroy();
    };
    input.on_cleanup(cleanup);

    content_box.focus();
    if (typeof content_box.setScrollPerc === "function") {
      content_box.setScrollPerc(0);
    }
    shell.footer_box.setContent(t({
      zh: "Enter / Esc 返回 · ↑↓ 滚动 · q 返回",
      en: "Enter / Esc back · ↑↓ scroll · q back",
    }));
    content_box.key(["enter", "escape", "q", "C-c"], finish);
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || text.includes("\r") || text.includes("\n") || is_plain_escape_input(text)) {
        finish();
      }
    };
    process.stdin.on("data", raw_input_listener);
    shell.screen.render();
  });
}

/**
 * 渲染底部提示条。
 */
export function render_sidebar_hint(
  shell: shell_layout,
  options: admin_tui_select_option[],
  selected: number | undefined,
): void {
  const option = options[typeof selected === "number" ? selected : 0];
  const hint = option && !is_disabled_option(option) ? ` · ${option_description(option)}` : "";
  shell.footer_box.setContent(`${t({
    zh: "Enter 选择 · Esc / q 返回 · ↑↓ 切换",
    en: "Enter choose · Esc / q back · ↑↓ navigate",
  })}${hint}`);
  shell.screen.render();
}

export function format_sidebar_option(option: admin_tui_select_option): string {
  if (is_disabled_option(option)) {
    return `── ${option.label} ──`;
  }
  return option.label;
}

export function format_option_detail(
  title: string,
  option: admin_tui_select_option | undefined,
): string {
  if (!option) {
    return t({
      zh: "未选择项目",
      en: "No item selected",
    });
  }
  if (is_disabled_option(option)) {
    return [
      `{bold}${option.label}{/bold}`,
      t({
        zh: "这是侧边栏分区标题，用于区分管理项和导航项。",
        en: "This is a sidebar section heading that separates management and navigation items.",
      }),
      "",
      `${t({ zh: "当前位置", en: "current section" })}: ${title}`,
    ].join("\n");
  }

  return [
    `{bold}${option.label}{/bold}`,
    option_description(option),
    "",
    `${t({ zh: "当前位置", en: "current section" })}: ${title}`,
    `${t({ zh: "值", en: "value" })}: ${option.value}`,
  ].join("\n");
}

export function option_description(option: admin_tui_select_option): string {
  const explicit_hint = String(option.hint ?? "").trim();
  if (explicit_hint) return explicit_hint;
  return t({
    zh: `选择 ${option.label}`,
    en: `Select ${option.label}`,
  });
}

export function is_disabled_option(option: admin_tui_select_option | undefined): boolean {
  return option?.disabled === true;
}

export function format_table(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }

  const widths = rows[0].map((_cell, index) => {
    return Math.min(
      36,
      Math.max(...rows.map((row) => visible_width(row[index] ?? "")), 3),
    );
  });

  return rows
    .map((row, row_index) => {
      const line = row
        .map((cell, index) => pad_cell(cell, widths[index] ?? 12))
        .join("  ");
      if (row_index === 0 && rows.length > 1) {
        const rule = widths.map((width) => "-".repeat(width)).join("  ");
        return `${line}\n${rule}`;
      }
      return line;
    })
    .join("\n");
}

function pad_cell(value: string, width: number): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  const clipped = visible_width(normalized) > width
    ? `${normalized.slice(0, Math.max(0, width - 1))}…`
    : normalized;
  return clipped.padEnd(width, " ");
}

function visible_width(value: string): number {
  return String(value ?? "").length;
}

export function message_title(kind: admin_tui_message_kind): string {
  if (kind === "success") return t({ zh: "成功", en: "Success" });
  if (kind === "error") return t({ zh: "错误", en: "Error" });
  return t({ zh: "信息", en: "Info" });
}

/**
 * 输入态 footer 文案。
 */
export function text_footer_text(secret: boolean): string {
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

export function message_accent(kind: admin_tui_message_kind): "cyan" | "green" | "red" {
  if (kind === "success") return "green";
  if (kind === "error") return "red";
  return "cyan";
}
