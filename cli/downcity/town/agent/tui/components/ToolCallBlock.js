/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 标题使用 primary 色，详情行使用 textDim。
 * - 支持 tool-call、tool-result、approval-request、approval-result 四种展示形态。
 * - 对齐 Kimi Code 的 tool 卡片视觉：标题一行 + 缩进详情。
 */
import { Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { STATUS_BULLET } from "../constant/symbols.js";
import { MESSAGE_INDENT } from "../constant/rendering.js";
import { current_theme } from "../theme/index.js";
/**
 * tool 状态/结果卡片组件。
 */
export class ToolCallBlockComponent {
    entry;
    spacer;
    /**
     * @param entry tool 相关条目。
     */
    constructor(entry) {
        this.entry = entry;
        this.spacer = new Spacer(1);
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
        const title = this.build_title();
        const detail_lines = this.build_detail_lines();
        const lines = [];
        for (const line of this.spacer.render(safe_width)) {
            lines.push(line);
        }
        const title_lines = new Text(current_theme.fg("primary", title), 0, 0).render(content_width);
        for (let i = 0; i < title_lines.length; i += 1) {
            const prefix = i === 0 ? bullet : " ".repeat(bullet_width);
            lines.push(prefix + title_lines[i]);
        }
        for (const detail of detail_lines) {
            const colored_detail = current_theme.fg("textDim", detail);
            const detail_lines_rendered = new Text(colored_detail, 0, 0).render(content_width);
            for (const line of detail_lines_rendered) {
                lines.push(MESSAGE_INDENT + line);
            }
        }
        return lines.map((line) => truncateToWidth(line, safe_width, "…"));
    }
    build_title() {
        switch (this.entry.kind) {
            case "tool-call":
                return `[tool] ${this.entry.tool_name}`;
            case "tool-result":
                return `[result] ${this.entry.tool_name}`;
            case "tool-approval-request":
                return `[approval] ${this.entry.tool_name} requests unrestricted sandbox`;
            case "tool-approval-result":
                return `[approval] ${this.entry.decision}`;
            default:
                return "";
        }
    }
    build_detail_lines() {
        switch (this.entry.kind) {
            case "tool-call":
                return this.format_json_args(this.entry.args);
            case "tool-result":
                return this.format_result(this.entry.result);
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
        return trimmed.split("\n").slice(0, 12);
    }
}
//# sourceMappingURL=ToolCallBlock.js.map