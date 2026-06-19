/**
 * Admin 单屏 TUI Shell 运行时。
 *
 * 关键说明（中文）
 * - Admin 启动后只创建一个 blessed screen，除退出外不再跳出全屏应用模式。
 * - 左侧 sidebar 承载所有菜单层级，右侧 section 只承载 loading、文本、JSON、消息与输入。
 * - 本模块只保留公共 runtime API，具体布局、渲染、输入循环拆分到 AdminTuiShell / AdminTuiRender / AdminTuiInput。
 */

import { t } from "../../shared/CliLocale.js";
import type {
  admin_tui_message_kind,
  admin_tui_runtime,
  admin_tui_select_option,
  admin_tui_table_input,
} from "../types/AdminTui.js";
import { create_shell, type shell_layout } from "./AdminTuiShell.js";
import {
  message_accent,
  message_title,
  render_loading,
  render_nav,
  render_option_detail,
  show_content,
  text_footer_text,
} from "./AdminTuiRender.js";
import {
  next_breadcrumb_parts,
  run_sidebar_select,
  run_text_in_content,
} from "./AdminTuiInput.js";

/**
 * 创建 admin TUI runtime。
 */
export function create_admin_tui_runtime(title = "Admin"): admin_tui_runtime {
  const shell = create_shell(title);
  let active_main_cleanup: (() => void) | undefined;
  let breadcrumb_parts: string[] = [title];
  const selected_index_by_breadcrumb = new Map<string, number>();

  const cleanup_main = (): void => {
    if (active_main_cleanup) {
      active_main_cleanup();
      active_main_cleanup = undefined;
    }
    shell.content_box.children.slice().forEach((child) => child.destroy());
  };

  const render_footer = (content: string): void => {
    shell.footer_box.setContent(content);
  };

  const runtime: admin_tui_runtime = {
    close(): void {
      cleanup_main();
      shell.screen.destroy();
    },

    async select_nav(nav_title: string, options: admin_tui_select_option[]): Promise<string | undefined> {
      cleanup_main();
      breadcrumb_parts = [nav_title];
      const breadcrumb_key = nav_title;
      const selected_index = resolve_selectable_index_from_input(
        options,
        selected_index_by_breadcrumb.get(breadcrumb_key),
      );
      render_nav(shell, nav_title, options, selected_index);
      render_option_detail(shell, nav_title, options[selected_index]);
      return await run_sidebar_select({
        shell,
        title: nav_title,
        options,
        initial_index: selected_index,
        on_select_index: (index) => selected_index_by_breadcrumb.set(breadcrumb_key, index),
        on_focus_option: (option) => render_option_detail(shell, nav_title, option),
      });
    },

    async select(section_title: string, options: admin_tui_select_option[]): Promise<string | undefined> {
      breadcrumb_parts = next_breadcrumb_parts(breadcrumb_parts, section_title);
      const breadcrumb_key = breadcrumb_parts.join(" / ");
      const selected_index = resolve_selectable_index_from_input(
        options,
        selected_index_by_breadcrumb.get(breadcrumb_key),
      );
      render_nav(shell, breadcrumb_key, options, selected_index);
      cleanup_main();
      render_option_detail(shell, section_title, options[selected_index]);
      return await run_sidebar_select({
        shell,
        title: section_title,
        options,
        initial_index: selected_index,
        on_select_index: (index) => selected_index_by_breadcrumb.set(breadcrumb_key, index),
        on_focus_option: (option) => render_option_detail(shell, section_title, option),
      });
    },

    async text(section_title: string, placeholder?: string): Promise<string | undefined> {
      cleanup_main();
      render_footer(text_footer_text(false));
      return await run_text_in_content(shell, {
        title: section_title,
        placeholder,
        secret: false,
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },

    async password(section_title: string, placeholder?: string): Promise<string | undefined> {
      cleanup_main();
      render_footer(text_footer_text(true));
      return await run_text_in_content(shell, {
        title: section_title,
        placeholder,
        secret: true,
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },

    async with_loading<T>(section_title: string, task: () => Promise<T>): Promise<T> {
      cleanup_main();
      render_loading(shell, section_title);
      render_footer(t({
        zh: "加载中...",
        en: "Loading...",
      }));
      shell.screen.render();
      try {
        return await task();
      } finally {
        cleanup_main();
      }
    },

    async show_text(section_title: string, content: string): Promise<void> {
      await show_content(shell, {
        title: section_title,
        content: String(content || ""),
        accent: "cyan",
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },

    async show_table(input: admin_tui_table_input): Promise<void> {
      const rows = input.rows.length > 0
        ? [input.columns, ...input.rows.map((row) => row.cells)]
        : [[input.empty_message ?? t({ zh: "暂无数据", en: "No data" })]];
      await show_content(shell, {
        title: input.title,
        content: format_table(rows),
        accent: "cyan",
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },

    async show_json(section_title: string, data: unknown): Promise<void> {
      await show_content(shell, {
        title: section_title,
        content: JSON.stringify(data, null, 2),
        accent: "cyan",
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },

    async show_message(kind: admin_tui_message_kind, message: string): Promise<void> {
      await show_content(shell, {
        title: message_title(kind),
        content: message,
        accent: message_accent(kind),
        on_cleanup: (cleanup) => {
          active_main_cleanup = cleanup;
        },
      });
    },
  };

  return runtime;
}

function resolve_selectable_index_from_input(
  options: admin_tui_select_option[],
  stored_index: number | undefined,
): number {
  const value = typeof stored_index === "number" ? stored_index : 0;
  if (value >= 0 && value < options.length) return value;
  return 0;
}

function format_table(rows: string[][]): string {
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
