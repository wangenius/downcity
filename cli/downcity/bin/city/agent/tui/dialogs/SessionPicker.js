/**
 * Session 选择器弹窗。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code DESIGN.md 的列表 dialog 规范。
 * - 顶部/底部使用 primary 色平直边框 `─`。
 * - 选中指针为 `❯ `，当前项行尾标记 ` ← current`。
 * - 支持实时搜索：有 query 时显示 Search 行，Esc 先清 query 再取消。
 */
import { matchesKey, Key, truncateToWidth, visibleWidth, } from "@earendil-works/pi-tui";
import { SESSION_PICKER_MAX_VISIBLE } from "../../../../city/agent/tui/constant/rendering.js";
import { CURRENT_MARK, SELECT_POINTER } from "../../../../city/agent/tui/constant/symbols.js";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
import { formatRelativeTime } from "../../../../city/agent/tui/utils/time.js";
import { singleLine } from "../../../../city/agent/tui/utils/text.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID } from "../../../../city/agent/AgentChatTypes.js";
const BORDER_HORIZONTAL = "─";
const ELLIPSIS = "…";
/**
 * Session 选择器。
 */
export class SessionPickerComponent {
    items;
    filtered_items;
    current_session_id;
    selected_index = 0;
    query = "";
    max_visible;
    on_select;
    on_cancel;
    focused = false;
    /**
     * @param sessions 远程 session 摘要列表。
     * @param current_session_id 当前生效的 sessionId。
     * @param on_select 选中回调。
     * @param on_cancel 取消回调。
     * @param max_visible 最大可见项数。
     */
    constructor(params) {
        this.current_session_id = params.current_session_id;
        this.on_select = params.on_select;
        this.on_cancel = params.on_cancel;
        this.max_visible = Math.max(1, params.max_visible ?? SESSION_PICKER_MAX_VISIBLE);
        this.items = this.build_items(params.sessions);
        this.filtered_items = [...this.items];
    }
    /**
     * 刷新列表数据。
     *
     * @param sessions 新的 session 列表。
     * @param current_session_id 当前 sessionId。
     */
    refresh(sessions, current_session_id) {
        this.current_session_id = current_session_id;
        this.items = this.build_items(sessions);
        this.apply_filter();
    }
    /**
     * 无缓存需要清理。
     */
    invalidate() {
        // 列表项文本不依赖 ANSI 缓存。
    }
    /**
     * 处理键盘输入。
     *
     * @param data pi-tui 输入数据。
     */
    handleInput(data) {
        if (matchesKey(data, Key.up)) {
            this.move_selection(-1);
            return;
        }
        if (matchesKey(data, Key.down)) {
            this.move_selection(1);
            return;
        }
        if (matchesKey(data, Key.enter)) {
            this.confirm_selection();
            return;
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
            if (this.query.length > 0) {
                this.query = "";
                this.apply_filter();
            }
            else {
                this.on_cancel();
            }
            return;
        }
        if (matchesKey(data, Key.backspace)) {
            if (this.query.length > 0) {
                this.query = this.query.slice(0, -1);
                this.apply_filter();
            }
            return;
        }
        const char = this.decode_printable_char(data);
        if (char && !matchesKey(data, Key.enter)) {
            this.query += char;
            this.apply_filter();
        }
    }
    /**
     * 渲染选择器弹窗。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        const inner_width = Math.max(1, safe_width - 2);
        const lines = [];
        lines.push(current_theme.fg("primary", BORDER_HORIZONTAL.repeat(safe_width)));
        lines.push(this.render_title(inner_width));
        lines.push(current_theme.dim_fg("textMuted", this.render_hint(inner_width)));
        lines.push("");
        if (this.query.length > 0) {
            lines.push(this.render_query(inner_width));
        }
        const visible_items = this.get_visible_items();
        if (visible_items.length === 0) {
            lines.push(current_theme.fg("textDim", "  No matching sessions"));
        }
        else {
            for (const item of visible_items) {
                lines.push(this.render_item(item, inner_width));
            }
        }
        lines.push(this.render_scroll_info(inner_width));
        lines.push(current_theme.fg("primary", BORDER_HORIZONTAL.repeat(safe_width)));
        return lines.map((line) => truncateToWidth(line, safe_width, ELLIPSIS));
    }
    build_items(sessions) {
        const create_item = {
            value: "__create__",
            label: "+ Create new session",
            description: "Start with an empty CLI chat context",
            is_current: false,
            is_create: true,
        };
        const default_item = {
            value: AGENT_CHAT_DEFAULT_SESSION_ID,
            label: AGENT_CHAT_DEFAULT_SESSION_ID,
            description: "Default local CLI chat session",
            is_current: this.current_session_id === AGENT_CHAT_DEFAULT_SESSION_ID,
            is_create: false,
        };
        const session_items = sessions
            .filter((session) => session.sessionId !== AGENT_CHAT_DEFAULT_SESSION_ID)
            .map((session) => ({
            value: session.sessionId,
            label: session.title || session.sessionId,
            description: this.build_session_description(session),
            is_current: session.sessionId === this.current_session_id,
            is_create: false,
        }));
        return [create_item, default_item, ...session_items];
    }
    build_session_description(session) {
        const parts = [`${session.messageCount} messages`];
        if (session.previewText) {
            parts.push(singleLine(session.previewText));
        }
        if (session.executing) {
            parts.push("running");
        }
        if (session.updatedAt) {
            parts.push(formatRelativeTime(session.updatedAt));
        }
        return parts.join(" · ");
    }
    apply_filter() {
        const query = this.query.toLowerCase();
        if (query.length === 0) {
            this.filtered_items = [...this.items];
        }
        else {
            this.filtered_items = this.items.filter((item) => singleLine(item.label).toLowerCase().includes(query));
        }
        this.selected_index = Math.min(this.selected_index, Math.max(0, this.filtered_items.length - 1));
    }
    get_visible_items() {
        const total = this.filtered_items.length;
        if (total <= this.max_visible) {
            return this.filtered_items;
        }
        const half = Math.floor(this.max_visible / 2);
        const start = Math.max(0, Math.min(this.selected_index - half, total - this.max_visible));
        return this.filtered_items.slice(start, start + this.max_visible);
    }
    move_selection(direction) {
        if (this.filtered_items.length === 0) {
            return;
        }
        const next = this.selected_index + direction;
        if (next < 0) {
            this.selected_index = this.filtered_items.length - 1;
        }
        else if (next >= this.filtered_items.length) {
            this.selected_index = 0;
        }
        else {
            this.selected_index = next;
        }
    }
    confirm_selection() {
        const item = this.filtered_items[this.selected_index];
        if (!item) {
            return;
        }
        if (item.is_create) {
            this.on_select({ kind: "create" });
        }
        else {
            this.on_select({ kind: "session", sessionId: item.value });
        }
    }
    render_title(inner_width) {
        const title = current_theme.bold_fg("primary", " Select or create session ");
        const suffix = this.query.length === 0
            ? current_theme.dim_fg("textMuted", " (type to search)")
            : "";
        return " " + truncateToWidth(title + suffix, inner_width, ELLIPSIS);
    }
    render_hint(inner_width) {
        const parts = ["↑↓ navigate", "Enter select", "Esc cancel"];
        if (this.query.length > 0) {
            parts.push("Backspace clear");
        }
        return " " + truncateToWidth(parts.join(" · "), inner_width, ELLIPSIS);
    }
    render_query(inner_width) {
        const label = current_theme.fg("primary", " Search: ");
        return " " + truncateToWidth(label + this.query, inner_width, ELLIPSIS);
    }
    render_item(item, inner_width) {
        const is_selected = this.filtered_items[this.selected_index]?.value === item.value;
        // pointer 占 2 列：1 列符号 + 1 列空格，未选中时用两个空格占位保持对齐。
        const pointer = is_selected
            ? current_theme.fg("primary", `${SELECT_POINTER} `)
            : "  ";
        const pointer_width = 2;
        const content_width = Math.max(1, inner_width - pointer_width);
        let main_text = item.label;
        if (item.is_current) {
            main_text += ` ${CURRENT_MARK}`;
        }
        const description_width = Math.floor(content_width * 0.45);
        const max_label_width = Math.max(1, content_width - description_width - 2);
        const label_text = truncateToWidth(main_text, max_label_width, ELLIPSIS);
        const label_colored = is_selected
            ? current_theme.bold_fg("primary", label_text)
            : current_theme.fg("text", label_text);
        const desc_text = truncateToWidth(item.description, Math.max(1, content_width - visibleWidth(pointer + label_text) - 1), ELLIPSIS);
        const desc_colored = current_theme.fg("textDim", desc_text);
        const line = pointer + label_colored;
        const padding = Math.max(1, content_width - visibleWidth(line) - visibleWidth(desc_colored));
        return line + " ".repeat(padding) + desc_colored;
    }
    render_scroll_info(inner_width) {
        if (this.filtered_items.length <= this.max_visible) {
            return "";
        }
        const total = this.filtered_items.length;
        const matched = this.query.length > 0 ? `${this.selected_index + 1} / ${total}` : `${total} sessions`;
        const text = ` ▼ ${matched}`;
        return " " + truncateToWidth(current_theme.fg("textMuted", text), inner_width, ELLIPSIS);
    }
    decode_printable_char(data) {
        if (data.length !== 1) {
            return undefined;
        }
        const code = data.charCodeAt(0);
        if (code >= 32 && code <= 126) {
            return data;
        }
        return undefined;
    }
}
//# sourceMappingURL=SessionPicker.js.map