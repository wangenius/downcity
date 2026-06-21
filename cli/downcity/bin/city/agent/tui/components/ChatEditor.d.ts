/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对 pi-tui Editor 的薄封装，统一主题与提交回调。
 * - 负责设置边框颜色、清空输入、获取当前文本。
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
    /**
     * 覆写渲染，注入 prompt 符号并高亮 slash 命令首 token。
      * 对齐 Kimi Code 的 CustomEditor.render。
      *
      * @param width 可用宽度。
      * @returns 渲染后的行数组。
      */
    render(width: number): string[];
}
//# sourceMappingURL=ChatEditor.d.ts.map