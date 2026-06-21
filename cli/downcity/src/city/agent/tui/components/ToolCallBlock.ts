/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code ToolCallComponent 的 header 样式：
 *   运行中显示 `Using {tool} (keyArg)`，完成后显示 `Used {tool} (keyArg)`。
 * - bullet 颜色随状态变化：pending 用 text，success 用 success，error 用 error。
 * - 同一组件先展示 tool-call 参数，收到 tool-result 后通过 `update_result` 更新为结果。
 * - 支持 approval-request / approval-result 展示形态。
 * - 默认折叠，仅展示标题与最多 RESULT_PREVIEW_LINES 行详情，
 *   避免长输出把历史消息顶出可视区。
 */

import { Spacer, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import {
  FAILURE_MARK,
  STATUS_BULLET,
  SUCCESS_MARK,
} from "@/city/agent/tui/constant/symbols.js";
import { MESSAGE_INDENT, RESULT_PREVIEW_LINES } from "@/city/agent/tui/constant/rendering.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type {
  ToolApprovalRequestEntry,
  ToolApprovalResultEntry,
  ToolCallEntry,
} from "@/city/agent/tui/types.js";

/**
 * 可展示的 tool 块条目联合类型。
 */
export type ToolBlockEntry =
  | ToolCallEntry
  | ToolApprovalRequestEntry
  | ToolApprovalResultEntry;

/** key argument 最大展示长度。 */
const MAX_KEY_ARG_LENGTH = 60;

/**
 * tool 状态/结果卡片组件。
 */
export class ToolCallBlockComponent implements Component {
  private readonly entry: ToolBlockEntry;
  private expanded = false;
  private readonly spacer: Spacer;

  /**
   * @param entry tool 相关条目。
   */
  constructor(entry: ToolBlockEntry) {
    this.entry = entry;
    this.spacer = new Spacer(1);
    if (entry.kind === "tool-call") {
      entry.status = entry.status ?? "pending";
    }
  }

  /**
   * 切换展开/折叠状态。
   */
  toggle(): void {
    this.expanded = !this.expanded;
  }

  /**
   * 设置展开状态。
   *
   * @param expanded 是否展开。
   */
  set_expanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  /**
   * 当前是否处于展开状态。
   */
  is_expanded(): boolean {
    return this.expanded;
  }

  /**
   * 注入 tool 执行结果。
   *
   * @param result tool 返回结果。
   */
  update_result(result: unknown): void {
    if (this.entry.kind !== "tool-call") {
      return;
    }
    this.entry.result = result;
    this.entry.status = "success";
  }

  /**
   * 无缓存需要清理。
   */
  invalidate(): void {
    // entry 不变，无需刷新。
  }

  /**
   * 渲染 tool 卡片。
   *
   * @param width 可用宽度。
   * @returns 渲染后的行数组。
   */
  render(width: number): string[] {
    const safe_width = Math.max(0, width);
    if (safe_width <= 0) {
      return [""];
    }

    const lines: string[] = [];

    // 关键点（中文）：对齐 Kimi Code，tool 卡片顶部自带 1 行间距。
    for (const line of this.spacer.render(safe_width)) {
      lines.push(line);
    }

    // header：build_title 已包含染色 bullet。
    const title = this.build_title();
    const title_lines = new Text(title, 0, 0).render(safe_width);
    for (let i = 0; i < title_lines.length; i += 1) {
      const line = i === 0 ? title_lines[i] : MESSAGE_INDENT + title_lines[i];
      lines.push(line);
    }

    // body：缩进与 bullet 对齐。
    const detail_lines = this.build_detail_lines();
    const body_lines: string[] = [];
    for (const detail of detail_lines) {
      const colored_detail = current_theme.fg("textDim", detail);
      const rendered = new Text(colored_detail, 0, 0).render(safe_width);
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

  private build_title(): string {
    switch (this.entry.kind) {
      case "tool-call": {
        const is_success = this.entry.status === "success";
        const is_error = this.entry.status === "error";
        const bullet = is_success
          ? current_theme.fg("success", STATUS_BULLET)
          : is_error
            ? current_theme.fg("error", FAILURE_MARK)
            : current_theme.fg("text", STATUS_BULLET);
        let verb: string;
        if (is_error) {
          verb = "Failed";
        } else if (is_success) {
          verb = "Used";
        } else {
          verb = "Using";
        }
        const tool_label = current_theme.bold_fg("primary", this.entry.tool_name);
        const key_arg = extract_key_argument(this.entry.tool_name, this.entry.args);
        const arg_str = key_arg ? current_theme.dim(` (${key_arg})`) : "";
        return `${bullet}${verb} ${tool_label}${arg_str}`;
      }
      case "tool-approval-request": {
        const bullet = current_theme.fg("accent", "▶ ");
        const tool_label = current_theme.bold_fg("primary", this.entry.tool_name);
        return `${bullet}${tool_label} requests unrestricted sandbox`;
      }
      case "tool-approval-result": {
        const is_approved = this.entry.decision === "approved";
        const mark = is_approved
          ? current_theme.fg("success", SUCCESS_MARK)
          : current_theme.fg("error", FAILURE_MARK);
        const decision_text = current_theme.bold_fg(
          is_approved ? "success" : "error",
          this.entry.decision,
        );
        return `${mark}${decision_text}`;
      }
      default:
        return "";
    }
  }

  private build_detail_lines(): string[] {
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

  private format_json_args(args: unknown): string[] {
    if (args === null || args === undefined) {
      return ["no arguments"];
    }
    if (typeof args === "object" && !Array.isArray(args)) {
      const lines: string[] = [];
      for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
        const value_text = typeof value === "string" ? value : JSON.stringify(value);
        lines.push(`${key}: ${value_text}`);
      }
      return lines.length > 0 ? lines : ["no arguments"];
    }
    return [JSON.stringify(args)];
  }

  private format_result(result: unknown): string[] {
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

/**
 * 路径类参数 key 集合：截断时保留尾部文件名。
 */
const PATH_KEYS = new Set(["path", "file_path"]);

/**
 * 从 tool 参数中提取用于 header 展示的关键参数。
 *
 * 对齐 Kimi Code 的 extractKeyArgument：
 * - 优先取工具语义上最标识性的参数。
 * - glob 拼接 pattern + path 作为摘要。
 * - 路径类参数超长时保留尾部文件名（前缀用 … 省略）。
 */
function extract_key_argument(tool_name: string, args: unknown): string | null {
  if (args === null || typeof args !== "object") {
    return null;
  }
  const record = args as Record<string, unknown>;
  const lower_name = tool_name.toLowerCase();

  // glob：拼接 pattern 与可选 path，生成单行摘要。
  if (lower_name === "glob") {
    const pattern = record["pattern"];
    if (typeof pattern !== "string" || pattern.length === 0) {
      return null;
    }
    let summary = pattern;
    const path = record["path"];
    if (typeof path === "string" && path.length > 0) {
      summary += ` · ${path}`;
    }
    return truncate_arg_value("pattern", summary);
  }

  const key_map: Record<string, string[]> = {
    shell_exec: ["cmd", "command"],
    shell_start: ["cmd", "command"],
    shell_write: ["cmd", "command", "input"],
    read: ["path", "file_path"],
    write: ["path", "file_path"],
    edit: ["path", "file_path"],
    grep: ["pattern"],
  };

  const candidates = key_map[lower_name] ?? Object.keys(record);
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      const first_line = value.split("\n")[0] ?? value;
      const display =
        lower_name.includes("shell") && value.includes("\n")
          ? `${first_line}…`
          : first_line;
      return truncate_arg_value(key, display);
    }
  }
  return null;
}

/**
 * 截断过长参数值，保持 header 简洁。
 *
 * 路径类 key 保留尾部文件名（前缀省略为 …），其余 key 截断尾部。
 */
function truncate_arg_value(key: string, value: string): string {
  if (value.length <= MAX_KEY_ARG_LENGTH) {
    return value;
  }
  if (PATH_KEYS.has(key)) {
    return "…" + value.slice(value.length - (MAX_KEY_ARG_LENGTH - 1));
  }
  return value.slice(0, MAX_KEY_ARG_LENGTH - 1) + "…";
}
