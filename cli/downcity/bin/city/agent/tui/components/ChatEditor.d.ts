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
    connected_above: boolean;
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
    private cancel_autocomplete_activity;
}
//# sourceMappingURL=ChatEditor.d.ts.map