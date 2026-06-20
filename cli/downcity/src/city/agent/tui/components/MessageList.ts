/**
 * 消息流组件。
 *
 * 关键点（中文）
 * - 直接继承 pi-tui 的 Container，把每个 TranscriptEntry 渲染成独立子组件。
 * - 不维护固定视口高度，也不手动切片；交给外层 TUI 统一裁剪顶部溢出。
 * - 对齐 Kimi Code 的 transcriptContainer 思路：消息自然向下生长，最新内容永远靠近底部输入区。
 */

import { Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";

import { current_theme } from "@/city/agent/tui/theme/index.js";
import type { TranscriptEntry } from "@/city/agent/tui/types.js";
import { AssistantMessageComponent } from "@/city/agent/tui/components/AssistantMessage.js";
import { ToolCallBlockComponent, type ToolBlockEntry } from "@/city/agent/tui/components/ToolCallBlock.js";
import { UserMessageComponent } from "@/city/agent/tui/components/UserMessage.js";

/**
 * 消息流展示组件。
 */
export class MessageListComponent extends Container {
  private entries: TranscriptEntry[] = [];
  private components = new Map<string, Component>();

  /**
   * 添加一条消息条目。
   *
   * @param entry 新条目。
   */
  add_entry(entry: TranscriptEntry): void {
    this.entries.push(entry);
    const component = this.create_component(entry);
    this.components.set(entry.id, component);
    this.addChild(new Spacer(1));
    this.addChild(component);
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
      component.update_content(text);
    }
  }

  /**
   * 清空所有消息。
   */
  clear(): void {
    this.entries = [];
    this.components.clear();
    super.clear();
  }

  /**
   * 获取当前条目数量。
   */
  get entry_count(): number {
    return this.entries.length;
  }

  private create_component(entry: TranscriptEntry): Component {
    switch (entry.kind) {
      case "user":
        return new UserMessageComponent(entry.text);
      case "assistant":
        return new AssistantMessageComponent(true);
      case "tool-call":
      case "tool-result":
      case "tool-approval-request":
      case "tool-approval-result":
        return new ToolCallBlockComponent(entry as ToolBlockEntry);
      case "status":
        return new Text(`  ${current_theme.fg("textDim", entry.text)}`, 0, 0);
      case "error":
        return new Text(`  ${current_theme.fg("error", entry.text)}`, 0, 0);
      default:
        return new Container();
    }
  }
}
