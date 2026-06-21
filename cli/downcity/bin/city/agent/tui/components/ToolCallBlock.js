/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 标题使用 primary 色，详情行使用 textDim。
 * - 同一组件先展示 tool-call 参数，收到 tool-result 后通过 `update_result` 更新为结果。
 * - 支持 tool-call、approval-request、approval-result 三种展示形态。
 * - 对齐 Kimi Code 的 tool 卡片视觉：标题一行 + 缩进详情，默认折叠，避免单个 tool 结果占满屏幕。
 * - approval-result 根据决策显示 ✓ / ✗ 标记。
 * - 详情超过 RESULT_PREVIEW_LINES 时截断，展开后显示完整内容。
 */
import { Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { FAILURE_MARK, STATUS_BULLET, SUCCESS_MARK, } from "../../../../city/agent/tui/constant/symbols.js";
import { MESSAGE_INDENT, RESULT_PREVIEW_LINES } from "../../../../city/agent/tui/constant/rendering.js";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
/**
 * tool 状态/结果卡片组件。
 *
 * 默认折叠，仅展示标题与最多 RESULT_PREVIEW_LINES 行详情，
 * 避免长输出把历史消息顶出可视区。
 */
export class ToolCallBlockComponent {
    entry;
    expanded = false;
    spacer;
    /**
     * @param entry tool 相关条目。
     */
    constructor(entry) {
        this.entry = entry;
        this.spacer = new Spacer(1);
        if (entry.kind === "tool-call") {
            entry.status = entry.status ?? "pending";
        }
    }
    /**
     * 切换展开/折叠状态。
     */
    toggle() {
        this.expanded = !this.expanded;
    }
    /**
     * 设置展开状态。
     *
     * @param expanded 是否展开。
     */
    set_expanded(expanded) {
        this.expanded = expanded;
    }
    /**
     * 当前是否处于展开状态。
     */
    is_expanded() {
        return this.expanded;
    }
    /**
     * 注入 tool 执行结果。
     *
     * @param result tool 返回结果。
     */
    update_result(result) {
        if (this.entry.kind !== "tool-call") {
            return;
        }
        this.entry.result = result;
        this.entry.status = "success";
    }
    /**
     * 无缓存需要清理。
     */
    invalidate() {
        // entry 不变，无需刷新。
    }
    /**
     * 渲染 tool 卡片。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        const bullet = current_theme.fg("primary", STATUS_BULLET);
        const bullet_width = visibleWidth(bullet);
        const content_width = Math.max(1, safe_width - bullet_width);
        const lines = [];
        // 关键点（中文）：对齐 Kimi Code，tool 卡片顶部自带 1 行间距。
        for (const line of this.spacer.render(safe_width)) {
            lines.push(line);
        }
        // header：标题一行，首行带 bullet。
        const title = this.build_title();
        const title_lines = new Text(current_theme.fg("primary", title), 0, 0).render(content_width);
        for (let i = 0; i < title_lines.length; i += 1) {
            const prefix = i === 0 ? bullet : " ".repeat(bullet_width);
            lines.push(prefix + title_lines[i]);
        }
        // body：先按可用宽度算出实际视觉行，再按展开状态截断。
        const detail_lines = this.build_detail_lines();
        const body_lines = [];
        for (const detail of detail_lines) {
            const colored_detail = current_theme.fg("textDim", detail);
            const rendered = new Text(colored_detail, 0, 0).render(content_width);
            for (const line of rendered) {
                body_lines.push(MESSAGE_INDENT + line);
            }
        }
        if (body_lines.length > 0) {
            const visible_body = this.expanded
                ? body_lines
                : body_lines.slice(0, RESULT_PREVIEW_LINES);
            lines.push(...visible_body);
            if (!this.expanded && body_lines.length > RESULT_PREVIEW_LINES) {
                const remaining = body_lines.length - RESULT_PREVIEW_LINES;
                lines.push(MESSAGE_INDENT + current_theme.dim(`... (${remaining} more lines)`));
            }
        }
        return lines.map((line) => truncateToWidth(line, safe_width, "…"));
    }
    build_title() {
        switch (this.entry.kind) {
            case "tool-call": {
                if (this.entry.result !== undefined || this.entry.status === "success") {
                    return `[result] ${this.entry.tool_name}`;
                }
                return `[tool] ${this.entry.tool_name}`;
            }
            case "tool-approval-request":
                return `[approval] ${this.entry.tool_name} requests unrestricted sandbox`;
            case "tool-approval-result": {
                const mark = this.entry.decision === "approved" ? SUCCESS_MARK : FAILURE_MARK;
                return `[approval] ${mark}${this.entry.decision}`;
            }
            default:
                return "";
        }
    }
    build_detail_lines() {
        switch (this.entry.kind) {
            case "tool-call": {
                if (this.entry.result !== undefined) {
                    return this.format_result(this.entry.result);
                }
                return this.format_json_args(this.entry.args);
            }
            case "tool-approval-request":
                return [
                    `approval_id: ${this.entry.approval_id}`,
                    `operation: ${this.entry.operation}`,
                    `cmd: ${this.entry.command_value}`,
                    `cwd: ${this.entry.cwd}`,
                    `reason: ${this.entry.reason}`,
                ];
            case "tool-approval-result":
                return [
                    `approval_id: ${this.entry.approval_id}`,
                    `tool: ${this.entry.tool_name}`,
                ];
            default:
                return [];
        }
    }
    format_json_args(args) {
        if (args === null || args === undefined) {
            return ["no arguments"];
        }
        if (typeof args === "object" && !Array.isArray(args)) {
            const lines = [];
            for (const [key, value] of Object.entries(args)) {
                const value_text = typeof value === "string" ? value : JSON.stringify(value);
                lines.push(`${key}: ${value_text}`);
            }
            return lines.length > 0 ? lines : ["no arguments"];
        }
        return [JSON.stringify(args)];
    }
    format_result(result) {
        if (result === null || result === undefined) {
            return ["no output"];
        }
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        const trimmed = text.trim();
        if (!trimmed) {
            return ["no output"];
        }
        return trimmed.split("\n");
    }
}
//# sourceMappingURL=ToolCallBlock.js.map