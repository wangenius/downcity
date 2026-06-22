/**
 * Federation 交互式管理 TUI 入口。
 *
 * 关键点（中文）
 * - 使用 shared pi-tui runtime，保持与 fed/admin/city 首页一致的 TUI 框架。
 * - 状态构建与动作处理仍拆在 FederationManagerState.ts。
 * - 格式化与提示仍拆在 FederationManagerFormat.ts 与 FederationManagerPrompts.ts。
 */

import { Key, matchesKey, type Component, type Focusable } from "@earendil-works/pi-tui";
import { ManagedTuiRuntime } from "@/shared/tui/ManagedTuiRuntime.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import {
  resolve_tui_visible_scroll,
  tui_safe_body_height,
  tui_safe_render_width,
  tui_pad_end,
  tui_truncate,
  tui_viewport,
  tui_wrap_lines,
} from "@/shared/tui/TuiText.js";
import {
  resolve_loop_selectable_index,
  resolve_next_loop_selectable_index,
} from "@/city/tui/SelectableList.js";
import {
  build_city_manager_state,
  handle_city_action,
  handle_city_prompt_action,
  is_prompt_action,
  city_manager_action,
  city_manager_state,
} from "@/city/tui/FederationManagerState.js";
import {
  format_header,
  format_city_item_label,
  format_city_detail,
  format_footer,
  is_disabled_item,
} from "@/city/tui/FederationManagerFormat.js";
import type { tui_list_item } from "@/city/types/Tui.js";

const BORDER = "─";
const POINTER = "❯";

/**
 * 打开 City Federation 管理 TUI。
 */
export async function open_city_manager_tui(): Promise<void> {
  let next_state_params: {
    initial_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
  } | undefined;

  while (true) {
    const initial_state = await build_city_manager_state(next_state_params);
    const prompt_action = await run_city_manager_screen(initial_state);
    if (!prompt_action) return;
    next_state_params = await handle_city_prompt_action(prompt_action);
  }
}

async function run_city_manager_screen(
  initial_state: city_manager_state,
): Promise<city_manager_action | null> {
  const runtime = new ManagedTuiRuntime({ title: "Downcity City" });
  try {
    return await runtime.run_custom<city_manager_action | null>((finish, request_render) =>
      new CityManagerComponent({
        initial_state,
        finish,
        request_render,
      }),
    );
  } finally {
    runtime.close();
  }
}

interface city_manager_component_input {
  /** 初始 TUI 状态。 */
  initial_state: city_manager_state;
  /** 结束当前 screen 的回调。 */
  finish: (value: city_manager_action | null) => void;
  /** 请求 pi-tui 重绘。 */
  request_render: () => void;
}

class CityManagerComponent implements Component, Focusable {
  focused = false;
  private state: city_manager_state;
  private selected_index: number;
  private list_scroll = 0;
  private detail_scroll = 0;
  private readonly finish: (value: city_manager_action | null) => void;
  private readonly request_render: () => void;

  /**
   * @param input 组件构造参数。
   */
  constructor(input: city_manager_component_input) {
    this.state = input.initial_state;
    this.finish = input.finish;
    this.request_render = input.request_render;
    this.selected_index = input.initial_state.initial_action
      ? find_action_index(input.initial_state.items, input.initial_state.initial_action)
      : resolve_loop_selectable_index(input.initial_state.items, 0, 0);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move_selection(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move_selection(1);
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.detail_scroll = Math.max(0, this.detail_scroll - 8);
      this.request_render();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.detail_scroll += 8;
      this.request_render();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      void this.run_action();
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.finish(null);
    }
  }

  invalidate(): void {
    // 组件没有缓存。
  }

  render(width: number): string[] {
    const safe_width = tui_safe_render_width(width, 40);
    const left_width = Math.max(24, Math.min(42, Math.floor(safe_width * 0.38)));
    const right_width = Math.max(10, safe_width - left_width - 3);
    const body_height = tui_safe_body_height(5);
    this.list_scroll = resolve_tui_visible_scroll({
      selected_index: this.selected_index,
      scroll_offset: this.list_scroll,
      viewport_height: body_height,
      item_count: this.state.items.length,
    });
    const left_lines = this.render_list(left_width).slice(
      this.list_scroll,
      this.list_scroll + body_height,
    );
    const right_lines = this.render_detail(right_width);
    const right_view = tui_viewport(right_lines, body_height, this.detail_scroll);
    const item = this.state.items[this.selected_index];

    const output = [
      tui_truncate(current_theme.bold_fg("primary", "管理 Federation"), safe_width),
      tui_truncate(format_header(this.state), safe_width),
      tui_truncate(BORDER.repeat(safe_width), safe_width),
    ];

    for (let index = 0; index < body_height; index += 1) {
      const left = tui_pad_end(left_lines[index] ?? "", left_width);
      const right = tui_truncate(right_view[index] ?? "", right_width);
      output.push(`${left} ${current_theme.dim_fg("border", "│")} ${right}`);
    }

    output.push(tui_truncate(BORDER.repeat(safe_width), safe_width));
    output.push(tui_truncate(current_theme.dim_fg("textMuted", format_footer(item)), safe_width));
    return output;
  }

  private move_selection(delta: number): void {
    this.selected_index = resolve_next_loop_selectable_index(
      this.state.items,
      this.selected_index,
      delta,
    );
    this.state = {
      ...this.state,
      detail_override: undefined,
    };
    this.list_scroll = resolve_tui_visible_scroll({
      selected_index: this.selected_index,
      scroll_offset: this.list_scroll,
      viewport_height: tui_safe_body_height(5),
      item_count: this.state.items.length,
    });
    this.detail_scroll = 0;
    this.request_render();
  }

  private async refresh_state(params?: {
    keep_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
  }): Promise<void> {
    const next_state = await build_city_manager_state({
      detail_override: params?.detail_override,
      last_message: params?.last_message,
    });
    this.state = next_state;
    if (params?.keep_action) {
      this.selected_index = find_action_index(next_state.items, params.keep_action);
    } else {
      this.selected_index = resolve_loop_selectable_index(
        next_state.items,
        this.selected_index,
        0,
      );
    }
    this.list_scroll = resolve_tui_visible_scroll({
      selected_index: this.selected_index,
      scroll_offset: this.list_scroll,
      viewport_height: tui_safe_body_height(5),
      item_count: next_state.items.length,
    });
    this.detail_scroll = 0;
    this.request_render();
  }

  private set_detail(content: string): void {
    this.state = {
      ...this.state,
      detail_override: content,
    };
    this.detail_scroll = 0;
    this.request_render();
  }

  private async run_action(): Promise<void> {
    const item = this.state.items[this.selected_index];
    if (is_disabled_item(item)) return;
    const action = item?.id as city_manager_action | undefined;
    if (!action) return;
    if (action === "exit") {
      this.finish(null);
      return;
    }
    if (is_prompt_action(action)) {
      this.finish(action);
      return;
    }

    await handle_city_action({
      action,
      set_detail: (content) => this.set_detail(content),
      refresh_state: async (state) => await this.refresh_state(state),
    });
  }

  private render_list(width: number): string[] {
    return this.state.items.map((item, index) => {
      if (is_disabled_item(item)) {
        return current_theme.dim_fg("textMuted", tui_truncate(`  ${format_city_item_label(item)}`, width));
      }
      const selected = index === this.selected_index;
      const pointer = selected ? POINTER : " ";
      const title = selected
        ? current_theme.bold_fg("primary", item.title)
        : current_theme.fg("text", item.title);
      const subtitle = item.subtitle ? current_theme.dim_fg("textMuted", ` ${item.subtitle}`) : "";
      return tui_truncate(`${pointer} ${title}${subtitle}`, width);
    });
  }

  private render_detail(width: number): string[] {
    const item = this.state.items[this.selected_index];
    const detail = this.state.detail_override ?? format_city_detail(item);
    return tui_wrap_lines(detail, width);
  }
}

function find_action_index(items: tui_list_item[], action: city_manager_action): number {
  const index = items.findIndex((item) => item.id === action);
  return index >= 0 ? index : resolve_loop_selectable_index(items, 0, 0);
}
