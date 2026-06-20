/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对 pi-tui Editor 的薄封装，统一主题与提交回调。
 * - 负责设置边框颜色、清空输入、获取当前文本。
 */
import { Editor } from "@earendil-works/pi-tui";
import { createEditorTheme } from "../../../../city/agent/tui/theme/pi-tui-theme.js";
/**
 * 聊天输入框。
 */
export class ChatEditorComponent extends Editor {
    submit_handler;
    /**
     * @param tui 所属 TUI 实例。
     */
    constructor(tui) {
        super(tui, createEditorTheme(), {
            paddingX: 1,
        });
        this.borderColor = (text) => createEditorTheme().borderColor(text);
    }
    /**
     * 设置提交回调。
     */
    set on_submit(handler) {
        this.submit_handler = handler;
        this.onSubmit = (text) => {
            handler?.(text);
        };
    }
    /**
     * 获取提交回调。
     */
    get on_submit() {
        return this.submit_handler;
    }
    /**
     * 清空当前输入。
     */
    clear() {
        this.setText("");
    }
}
//# sourceMappingURL=ChatEditor.js.map