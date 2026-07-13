/**
 * 可滚动消息流组件。
 *
 * 关键点（中文）
 * - 内部使用 GutterContainer 保留左右边距。
 * - 维护 scroll_offset，支持 PageUp/PageDown 等快捷键回看历史。
 * - 默认贴底：scroll_offset 为 0 时始终显示最新内容。
 * - 用户向上滚动后，新追加的内容不应改变当前视口顶部位置。
 * - 消息顺序按 append 先后排列，最新内容在底部。
 */

import { type Component } from "@earendil-works/pi-tui";

import { GutterContainer } from "@/city/agent/tui/components/GutterContainer.js";
import { NoticeMessageComponent } from "@/city/agent/tui/components/NoticeMessage.js";
import { StatusMessageComponent } from "@/city/agent/tui/components/StatusMessage.js";
import { CHROME_GUTTER } from "@/city/agent/tui/constant/rendering.js";
import type { TranscriptEntry } from "@/city/agent/tui/types.js";
import { AssistantMessageComponent } from "@/city/agent/tui/components/AssistantMessage.js";
import { ToolCallBlockComponent, type ToolBlockEntry } from "@/city/agent/tui/components/ToolCallBlock.js";
import { UserMessageComponent } from "@/city/agent/tui/components/UserMessage.js";

/**
 * 消息流构造选项。
 */
export interface MessageListOptions {
  /** 获取当前可视区高度（行数）。 */
  get_viewport_height: () => number;
  /** 滚动位置变化回调，用于同步底部阅读状态。 */
  on_scroll_change?: (scroll_offset: number) => void;
}

/**
 * 可滚动消息流展示组件。
 */
export class MessageListComponent implements Component {
  private inner = new GutterContainer(CHROME_GUTTER, CHROME_GUTTER);
  private entries: TranscriptEntry[] = [];
  private components = new Map<string, Component>();
  private scroll_offset = 0;
  private last_rendered_line_count = 0;
  private get_viewport_height_fn: () => number;
  private on_scroll_change?: MessageListOptions["on_scroll_change"];

  /**
   * 全局 tool output 展开状态。
   * 对齐 Kimi Code：Ctrl+O 统一切换所有 tool 卡片，
   * 新创建的 tool 卡片也会沿用该状态。
   */
  private tool_output_expanded = false;

  /**
   * 构造可滚动消息流组件。
   *
   * @param options 构造选项。
   */
  constructor(options: MessageListOptions) {
    this.get_viewport_height_fn = options.get_viewport_height;
    this.on_scroll_change = options.on_scroll_change;
  }

  /**
   * 当前滚动偏移（0 表示贴底）。
   */
  get current_scroll_offset(): number {
    return this.scroll_offset;
  }

  /**
   * 统一设置所有 tool 卡片的展开状态，并记录为全局状态。
   * 后续新建的 tool 卡片会沿用该状态。
   *
   * @param expanded 是否展开。
   */
  set_all_tool_blocks_expanded(expanded: boolean): void {
    this.tool_output_expanded = expanded;
    for (const component of this.components.values()) {
      if (component instanceof ToolCallBlockComponent) {
        component.set_expanded(expanded);
      }
    }
  }

  /**
   * 添加一条消息条目。
   *
   * @param entry 新条目。
   */
  add_entry(entry: TranscriptEntry): void {
    this.entries.push(entry);
    const component = this.create_component(entry);
    this.components.set(entry.id, component);
    this.inner.addChild(component);
    // 用户已经向上滚动时，保持阅读位置；贴底时继续贴底。
    if (this.scroll_offset > 0) {
      // 新内容出现在底部，阅读位置相对底部会下移，这里不做补偿，
      // 由 render 时根据总高度重新钳制。
    }
  }

  /**
   * 更新指定 assistant 条目的文本。
   *
   * @param entry_id 目标条目 ID。
   * @param text 新文本。
   * @param streaming 是否仍在流式输出中。
   */
  update_assistant_text(entry_id: string, text: string, streaming: boolean): void {
    const entry = this.entries.find((item) => item.id === entry_id);
    if (!entry || entry.kind !== "assistant") {
      return;
    }
    entry.text = text;
    entry.streaming = streaming;
    const component = this.components.get(entry_id);
    if (component instanceof AssistantMessageComponent) {
      component.update_content(text, streaming);
    }
  }

  /**
   * 注入指定 tool 调用的执行结果。
   *
   * @param tool_call_id tool 调用唯一标识。
   * @param result tool 返回结果。
   * @param status 工具最终状态。
   */
  update_tool_result(
    tool_call_id: string,
    result: unknown,
    status: "success" | "error" = "success",
  ): void {
    for (const entry of this.entries) {
      if (entry.kind === "tool-call" && entry.tool_call_id === tool_call_id) {
        entry.result = result;
        entry.status = status;
        const component = this.components.get(entry.id);
        if (component instanceof ToolCallBlockComponent) {
          component.update_result(result, status);
        }
        return;
      }
    }
  }

  /**
   * 标记指定工具正在等待用户审批。
   *
   * @param tool_call_id 工具调用 ID。
   * @param approval_id 审批请求 ID。
   */
  require_tool_approval(tool_call_id: string, approval_id: string): void {
    for (const entry of this.entries) {
      if (entry.kind !== "tool-call" || entry.tool_call_id !== tool_call_id) continue;
      entry.status = "approval-required";
      entry.approval_id = approval_id;
      const component = this.components.get(entry.id);
      if (component instanceof ToolCallBlockComponent) {
        component.require_approval(approval_id);
      }
      return;
    }
  }

  /**
   * 清空所有消息。
   */
  clear(): void {
    this.entries = [];
    this.components.clear();
    this.inner.clear();
    this.set_scroll_offset(0);
  }

  /**
   * 获取当前条目数量。
   */
  get entry_count(): number {
    return this.entries.length;
  }

  /**
   * 按行数滚动。
   *
   * @param delta 正数向上（看历史），负数向下（回底部方向）。
   */
  scroll_by(delta: number): void {
    this.set_scroll_offset(Math.max(0, this.scroll_offset + delta));
  }

  /**
   * 滚动到底部（follow-tail）。
   */
  scroll_to_bottom(): void {
    this.set_scroll_offset(0);
  }

  /**
   * 切换当前是否贴底。
   *
   * @returns 切换后是否贴底。
   */
  toggle_follow_tail(): boolean {
    this.set_scroll_offset(this.scroll_offset === 0 ? 1 : 0);
    return this.scroll_offset === 0;
  }

  /**
   * 渲染消息流。
   *
   * @param width 可用宽度。
   * @returns 渲染后的行数组。
   */
  render(width: number): string[] {
    const all_lines = this.inner.render(width);
    const viewport_height = this.get_viewport_height_fn();
    const line_count_delta = all_lines.length - this.last_rendered_line_count;
    this.last_rendered_line_count = all_lines.length;

    // 用户已向上滚动且内容变长时，增加偏移以保持视口顶部内容稳定。
    if (line_count_delta > 0 && this.scroll_offset > 0) {
      this.set_scroll_offset(this.scroll_offset + line_count_delta);
    }

    if (viewport_height <= 0 || all_lines.length <= viewport_height) {
      this.set_scroll_offset(0);
      return all_lines;
    }
    const max_offset = all_lines.length - viewport_height;
    this.set_scroll_offset(Math.min(this.scroll_offset, max_offset));
    const start = Math.max(0, all_lines.length - viewport_height - this.scroll_offset);
    return all_lines.slice(start, start + viewport_height);
  }

  /**
   * 通知内部组件主题已变化。
   */
  invalidate(): void {
    this.inner.invalidate();
  }

  private create_component(entry: TranscriptEntry): Component {
    switch (entry.kind) {
      case "user":
        return new UserMessageComponent(entry.text);
      case "assistant": {
        const component = new AssistantMessageComponent(true, entry.streaming);
        component.update_content(entry.text, entry.streaming);
        return component;
      }
      case "tool-call":
      case "tool-approval-request":
      case "tool-approval-result": {
        const component = new ToolCallBlockComponent(entry as ToolBlockEntry);
        // 新建 tool 卡片沿用当前全局展开状态。
        component.set_expanded(this.tool_output_expanded);
        return component;
      }
      case "status":
        return new StatusMessageComponent(entry.text);
      case "error":
        return new NoticeMessageComponent("Error", entry.text);
      default:
        return new GutterContainer(CHROME_GUTTER, CHROME_GUTTER);
    }
  }

  /** 更新滚动位置并仅在值变化时通知外部状态栏。 */
  private set_scroll_offset(scroll_offset: number): void {
    if (this.scroll_offset === scroll_offset) return;
    this.scroll_offset = scroll_offset;
    this.on_scroll_change?.(scroll_offset);
  }
}
