/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对 pi-tui Editor 的薄封装，统一主题与提交回调。
 * - 负责设置边框颜色、清空输入、获取当前文本。
 */

import { CombinedAutocompleteProvider, Editor, type TUI } from "@earendil-works/pi-tui";

import { BUILTIN_SLASH_COMMANDS } from "@/city/agent/tui/commands/index.js";
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
      autocompleteMaxVisible: 6,
    });
    this.borderColor = (text: string) => createEditorTheme().borderColor(text);

    // 关键点（中文）：集成 pi-tui 的 CombinedAutocompleteProvider，
    // 输入 "/" 时弹出 slash 命令自动完成面板。对齐 Kimi Code 的编辑器行为。
    const commands = BUILTIN_SLASH_COMMANDS.map((command) => ({
      name: command.name,
      description: command.description,
    }));
    this.setAutocompleteProvider(
      new CombinedAutocompleteProvider(commands, process.cwd()),
    );
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
