/**
 * Admin TUI Shell 布局创建模块。
 *
 * 关键点（中文）
 * - 负责 blessed screen、侧边栏、内容区、底部 footer 的初始布局。
 * - 暴露 shell_layout 与 blessed 元素类型扩展，供 Render / Input / Runtime 复用。
 */

import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";

export interface blessed_box_element extends blessed.Widgets.BoxElement {
  focus: () => void;
  destroy: () => void;
  setScrollPerc?: (percentage: number) => void;
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_box_element;
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
  destroy: () => void;
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
  destroy: () => void;
  readInput: (callback: (error: Error | null, value?: string) => void) => void;
  clearValue: () => void;
  getValue: () => string;
  _done?: (error: Error | string | null, value?: string | null) => void;
}

export interface shell_layout {
  /** blessed 全屏根节点。 */
  screen: blessed.Widgets.Screen;

  /** 左侧导航容器。 */
  nav_box: blessed.Widgets.BoxElement;

  /** 面包屑容器。 */
  breadcrumb_box: blessed.Widgets.BoxElement;

  /** 左侧选项列表。 */
  nav_list: blessed_list_element;

  /** 右侧内容容器。 */
  content_box: blessed.Widgets.BoxElement;

  /** 底部提示容器。 */
  footer_box: blessed.Widgets.BoxElement;
}

/**
 * 创建 admin TUI 完整布局。
 */
export function create_shell(title: string): shell_layout {
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

  const nav_box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "34%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "侧边栏", en: "Sidebar" })} `,
    style: {
      border: { fg: "cyan" },
    },
  });

  const breadcrumb_box = blessed.box({
    parent: nav_box,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 2,
    tags: false,
    content: format_breadcrumb(title),
    style: {
      fg: "cyan",
      bold: true,
    },
  });

  const nav_list = blessed.list({
    parent: nav_box,
    top: 2,
    left: 0,
    width: "100%",
    height: "100%-2",
    keys: true,
    vi: true,
    mouse: true,
    items: [],
    style: build_list_style(),
  }) as blessed_list_element;

  const content_box = blessed.box({
    parent: screen,
    top: 0,
    left: "34%",
    width: "66%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "内容", en: "Section" })} `,
    style: {
      border: { fg: "cyan" },
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
      border: { fg: "cyan" },
      fg: "gray",
    },
    content: "",
  });

  screen.render();
  return { screen, nav_box, breadcrumb_box, nav_list, content_box, footer_box };
}

/**
 * 格式化面包屑文本。
 */
export function format_breadcrumb(title: string): string {
  return title.padEnd(80, " ");
}

function build_list_style(): blessed.Widgets.ListOptions["style"] {
  return {
    item: { fg: "white" },
    selected: {
      fg: "black",
      bg: "cyan",
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
