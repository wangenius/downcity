/**
 * Session 模型内联选择器。
 *
 * 关键点（中文）
 * - 展示 Federation 当前可用于 Agent 对话的模型。
 * - 支持按模型名称或 ID 搜索，并标记当前 Session 正在使用的模型。
 * - 选择结果只返回稳定 `model_id`，模型更新由 coordinator 外部完成。
 */

import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";

import { SESSION_PICKER_MAX_VISIBLE } from "@/city/agent/tui/constant/rendering.js";
import { CURRENT_MARK, SELECT_POINTER } from "@/city/agent/tui/constant/symbols.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type { AgentChatModelChoice } from "@/city/agent/tui/types/ModelPicker.js";
import { resolve_tui_visible_scroll } from "@/shared/tui/TuiText.js";

const BORDER_HORIZONTAL = "─";
const ELLIPSIS = "…";

/** 输入框下方的模型选择器。 */
export class ModelPickerComponent implements Component, Focusable {
  private readonly models: AgentChatModelChoice[];
  private filtered_models: AgentChatModelChoice[];
  private readonly current_model_id?: string;
  private readonly max_visible: number;
  private readonly on_select: (model_id: string) => void;
  private readonly on_cancel: () => void;
  private selected_index = 0;
  private scroll_offset = 0;
  private query = "";

  focused = false;

  /** 创建模型选择器。 */
  constructor(params: {
    /** 可选择的 Federation 模型。 */
    models: AgentChatModelChoice[];
    /** 当前 Session 使用的模型 ID。 */
    current_model_id?: string;
    /** 用户确认选择时触发。 */
    on_select: (model_id: string) => void;
    /** 用户取消选择时触发。 */
    on_cancel: () => void;
    /** 列表最大可见项数。 */
    max_visible?: number;
  }) {
    this.models = params.models;
    this.filtered_models = [...params.models];
    this.current_model_id = params.current_model_id;
    this.on_select = params.on_select;
    this.on_cancel = params.on_cancel;
    this.max_visible = Math.max(1, params.max_visible ?? SESSION_PICKER_MAX_VISIBLE);
    this.selected_index = Math.max(
      0,
      this.filtered_models.findIndex((model) => model.model_id === this.current_model_id),
    );
  }

  /** 模型列表不使用渲染缓存。 */
  invalidate(): void {
    // 所有内容均根据当前搜索和选择状态实时计算。
  }

  /** 处理导航、搜索、确认与取消输入。 */
  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move_selection(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move_selection(1);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const selected = this.filtered_models[this.selected_index];
      if (selected) this.on_select(selected.model_id);
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
      if (this.query) {
        this.query = "";
        this.apply_filter();
      } else {
        this.on_cancel();
      }
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      if (this.query) {
        this.query = this.query.slice(0, -1);
        this.apply_filter();
      }
      return;
    }
    if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
      this.query += data;
      this.apply_filter();
    }
  }

  /** 渲染模型选择器。 */
  render(width: number): string[] {
    const safe_width = Math.max(0, width);
    if (safe_width === 0) return [""];
    const inner_width = Math.max(1, safe_width - 2);
    const visible_models = this.get_visible_models();
    const lines = [
      current_theme.fg("primary", BORDER_HORIZONTAL.repeat(safe_width)),
      ` ${current_theme.bold_fg("primary", " Select session model ")}${this.query ? "" : current_theme.dim_fg("textMuted", " (type to search)")}`,
      current_theme.dim_fg("textMuted", " ↑↓ navigate · Enter select · Esc cancel"),
      "",
    ];

    if (this.query) {
      lines.push(` ${current_theme.fg("primary", "Search: ")}${this.query}`);
    }
    if (visible_models.length === 0) {
      lines.push(current_theme.fg("textDim", "  No matching models"));
    } else {
      for (const model of visible_models) lines.push(this.render_model(model, inner_width));
    }
    for (let index = Math.max(1, visible_models.length); index < this.max_visible; index += 1) {
      lines.push("");
    }
    if (this.filtered_models.length > this.max_visible) {
      lines.push(current_theme.fg("textMuted", ` ▼ ${this.selected_index + 1} / ${this.filtered_models.length}`));
    } else {
      lines.push("");
    }
    lines.push(current_theme.fg("primary", BORDER_HORIZONTAL.repeat(safe_width)));
    return lines.map((line) => truncateToWidth(line, safe_width, ELLIPSIS));
  }

  /** 应用名称和 ID 搜索。 */
  private apply_filter(): void {
    const query = this.query.toLowerCase();
    this.filtered_models = query
      ? this.models.filter((model) =>
        `${model.model_name} ${model.model_id}`.toLowerCase().includes(query))
      : [...this.models];
    this.selected_index = Math.min(this.selected_index, Math.max(0, this.filtered_models.length - 1));
    this.sync_scroll();
  }

  /** 移动当前选中项。 */
  private move_selection(direction: number): void {
    if (this.filtered_models.length === 0) return;
    this.selected_index = (
      this.selected_index + direction + this.filtered_models.length
    ) % this.filtered_models.length;
    this.sync_scroll();
  }

  /** 返回当前视口内的模型。 */
  private get_visible_models(): AgentChatModelChoice[] {
    this.sync_scroll();
    return this.filtered_models.slice(this.scroll_offset, this.scroll_offset + this.max_visible);
  }

  /** 同步列表滚动位置。 */
  private sync_scroll(): void {
    this.scroll_offset = resolve_tui_visible_scroll({
      selected_index: this.selected_index,
      scroll_offset: this.scroll_offset,
      viewport_height: this.max_visible,
      item_count: this.filtered_models.length,
    });
  }

  /** 渲染单个模型。 */
  private render_model(model: AgentChatModelChoice, inner_width: number): string {
    const is_selected = this.filtered_models[this.selected_index]?.model_id === model.model_id;
    const pointer = is_selected ? current_theme.fg("primary", `${SELECT_POINTER} `) : "  ";
    const current = model.model_id === this.current_model_id ? ` ${CURRENT_MARK}` : "";
    const name = `${model.model_name}${current}`;
    const description = [model.model_id, model.modalities.join("/")].filter(Boolean).join(" · ");
    const content_width = Math.max(1, inner_width - 2);
    const description_width = Math.floor(content_width * 0.45);
    const label = truncateToWidth(name, Math.max(1, content_width - description_width - 2), ELLIPSIS);
    const colored_label = is_selected
      ? current_theme.bold_fg("primary", label)
      : current_theme.fg("text", label);
    const colored_description = current_theme.fg(
      "textDim",
      truncateToWidth(description, description_width, ELLIPSIS),
    );
    const used_width = visibleWidth(pointer + label) + visibleWidth(colored_description);
    return pointer + colored_label + " ".repeat(Math.max(1, inner_width - used_width)) + colored_description;
  }
}
