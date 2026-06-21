/**
 * 聊天输入框组件。
 *
 * 关键点（中文）
 * - 对 pi-tui Editor 的薄封装，统一主题与提交回调。
 * - 负责设置边框颜色、清空输入、获取当前文本。
 */
import { CombinedAutocompleteProvider, Editor } from "@earendil-works/pi-tui";
import { BUILTIN_SLASH_COMMANDS } from "../../../../city/agent/tui/commands/index.js";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
import { createEditorTheme } from "../../../../city/agent/tui/theme/pi-tui-theme.js";
const ANSI_SGR = /\u001B\[[0-9;]*m/g;
/**
 * 移除 ANSI SGR 颜色序列。
 */
function strip_sgr(line) {
    return line.replace(ANSI_SGR, "");
}
/**
 * 高亮第一行的 slash 命令首 token。
 * 对齐 Kimi Code 的 highlightFirstSlashToken。
 */
function highlight_first_slash_token(line) {
    const visible = strip_sgr(line);
    const slash_index = visible.indexOf("/");
    if (slash_index < 0) {
        return undefined;
    }
    for (let i = 0; i < slash_index; i += 1) {
        if (visible[i] !== " " && visible[i] !== "\t") {
            return undefined;
        }
    }
    let end = slash_index + 1;
    while (end < visible.length) {
        const ch = visible[end];
        if (ch === " " || ch === "\t") {
            break;
        }
        end += 1;
    }
    const token = visible.slice(slash_index, end);
    if (token.slice(1).includes("/")) {
        return undefined;
    }
    let raw_index = 0;
    let visible_count = 0;
    let start_raw;
    let end_raw;
    while (raw_index < line.length) {
        ANSI_SGR.lastIndex = raw_index;
        const match = ANSI_SGR.exec(line);
        if (match !== null && match.index === raw_index) {
            raw_index += match[0].length;
            continue;
        }
        if (visible_count === slash_index) {
            start_raw = raw_index;
        }
        if (visible_count === end) {
            end_raw = raw_index;
            break;
        }
        visible_count += 1;
        raw_index += 1;
    }
    if (start_raw === undefined || end_raw === undefined) {
        return undefined;
    }
    const before = line.slice(0, start_raw);
    const target = line.slice(start_raw, end_raw);
    const after = line.slice(end_raw);
    return before + current_theme.fg("primary", target) + after;
}
/**
 * 在第一行内容前注入 `>` prompt 符号。
 * 对齐 Kimi Code 的 injectPromptSymbol。
 */
function inject_prompt_symbol(line) {
    if (line.length < 4) {
        return undefined;
    }
    for (let i = 0; i < 4; i += 1) {
        if (line[i] !== " ") {
            return undefined;
        }
    }
    return "  > " + line.slice(4);
}
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
            paddingX: 4,
            autocompleteMaxVisible: 6,
        });
        this.borderColor = (text) => createEditorTheme().borderColor(text);
        // 关键点（中文）：集成 pi-tui 的 CombinedAutocompleteProvider，
        // 输入 "/" 时弹出 slash 命令自动完成面板。对齐 Kimi Code 的编辑器行为。
        const commands = BUILTIN_SLASH_COMMANDS.map((command) => ({
            name: command.name,
            description: command.description,
        }));
        this.setAutocompleteProvider(new CombinedAutocompleteProvider(commands, process.cwd()));
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
    /**
     * 覆写渲染，注入 prompt 符号并高亮 slash 命令首 token。
      * 对齐 Kimi Code 的 CustomEditor.render。
      *
      * @param width 可用宽度。
      * @returns 渲染后的行数组。
      */
    render(width) {
        const lines = super.render(width);
        if (lines.length < 3) {
            return lines;
        }
        const first_content_index = 1;
        const text = this.getText().trimStart();
        if (text.startsWith("/")) {
            const original = lines[first_content_index];
            if (original !== undefined) {
                const highlighted = highlight_first_slash_token(original);
                if (highlighted !== undefined) {
                    lines[first_content_index] = highlighted;
                }
            }
        }
        const first_content = lines[first_content_index];
        if (first_content !== undefined) {
            const with_prompt = inject_prompt_symbol(first_content);
            if (with_prompt !== undefined) {
                lines[first_content_index] = with_prompt;
            }
        }
        return lines;
    }
}
//# sourceMappingURL=ChatEditor.js.map