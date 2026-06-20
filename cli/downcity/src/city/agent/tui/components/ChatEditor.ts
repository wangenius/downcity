/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对 pi-tui Editor 的薄封装，统一主题与提交回调。
 * - 负责设置边框颜色、清空输入、获取当前文本。
 */

import { Editor, type TUI } from "@earendil-works/pi-tui";

import { createEditorTheme } from "@/city/agent/tui/theme/pi-tui-theme.js";

/**
 * 输入框提交回调。
 */
export type ChatEditorSubmitHandler = (text: string) => void;

/**
 * 聊天输入框。
 */
export class ChatEditorComponent extends Editor {
  private submit_handler?: ChatEditorSubmitHandler;

  /**
   * @param tui 所属 TUI 实例。
   */
  constructor(tui: TUI) {
    super(tui, createEditorTheme(), {
      paddingX: 1,
    });
    this.borderColor = (text: string) => createEditorTheme().borderColor(text);
  }

  /**
   * 设置提交回调。
   */
  set on_submit(handler: ChatEditorSubmitHandler | undefined) {
    this.submit_handler = handler;
    this.onSubmit = (text: string) => {
      handler?.(text);
    };
  }

  /**
   * 获取提交回调。
   */
  get on_submit(): ChatEditorSubmitHandler | undefined {
    return this.submit_handler;
  }

  /**
   * 清空当前输入。
   */
  clear(): void {
    this.setText("");
  }
}
