/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 直接对齐 Kimi Code 的 CustomEditor：带完整边框、prompt 符号、slash 高亮、
 *   描述换行的 slash 自动完成，以及标准应用级快捷键回调。
 */
import { Editor, type TUI } from "@earendil-works/pi-tui";
/**
 * 输入框提交回调。
 */
export type ChatEditorSubmitHandler = (text: string) => void;
/**
 * 聊天输入框。
 */
export declare class ChatEditorComponent extends Editor {
    on_escape?: () => void;
    on_ctrl_c?: () => void;
    on_ctrl_d?: () => void;
    on_ctrl_g?: () => void;
    on_ctrl_o?: () => void;
    on_ctrl_s?: () => void;
    on_undo?: () => void;
    on_insert_newline?: () => void;
    on_text_paste?: () => void;
    on_shift_tab?: () => void;
    /** 空编辑器时按 ↑，返回 true 表示已消费。 */
    on_up_arrow_empty?: () => boolean;
    /** 空编辑器时按 ↓，返回 true 表示已消费。 */
    on_down_arrow_empty?: () => boolean;
    /**
     * 粘贴图片回调（Unix 用 Ctrl-V，Windows 用 Alt-V）。
     * 返回 true 表示已处理，false 继续走普通粘贴。
     */
    on_paste_image?: () => Promise<boolean>;
    connected_above: boolean;
    border_highlighted: boolean;
    private consuming_paste;
    private consume_buffer;
    private submit_handler?;
    /**
     * @param tui 所属 TUI 实例。
     */
    constructor(tui: TUI);
    /**
     * 设置提交回调。
     */
    set on_submit(handler: ChatEditorSubmitHandler | undefined);
    /**
     * 获取提交回调。
     */
    get on_submit(): ChatEditorSubmitHandler | undefined;
    /**
     * 清空当前输入。
     */
    clear(): void;
    handleInput(data: string): void;
    /**
     * 覆写渲染，注入 prompt 符号、高亮 slash 命令，并补全边框。
     */
    render(width: number): string[];
    /**
     * 是否正在显示自动完成或仍有未完成的补全请求。
     */
    private has_autocomplete_activity;
    private cancel_autocomplete_activity;
    /**
     * 如果光标位于 paste marker 上，将其展开为实际内容。
     */
    private expand_paste_marker_at_cursor;
}
//# sourceMappingURL=ChatEditor.d.ts.map