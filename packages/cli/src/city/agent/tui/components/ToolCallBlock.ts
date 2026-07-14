/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 使用完整边框表达一次工具执行，状态标记固定在 Header 右侧。
 * - 工具名、关键参数、执行结果分别占据稳定的信息层级。
 * - 同一组件先展示 tool-call 参数，收到 tool-result 后通过 `update_result` 更新为结果。
 * - 支持 approval-request / approval-result 展示形态。
 * - 默认折叠，仅展示标题与最多 RESULT_PREVIEW_LINES 行详情，
 *   避免长输出把历史消息顶出可视区。
 */

import {
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";

import { FAILURE_MARK, SUCCESS_MARK } from "@/city/agent/tui/constant/symbols.js";
import { RESULT_PREVIEW_LINES } from "@/city/agent/tui/constant/rendering.js";
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
   * 补全流式 tool 调用的名称与输入。
   *
   * @param tool_name tool 名称。
   * @param args 已完成解析的 tool 输入。
   */
  update_input(tool_name: string, args: unknown): void {
    if (this.entry.kind !== "tool-call") return;
    this.entry.tool_name = tool_name;
    this.entry.args = args;
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
  update_result(result: unknown, status: "success" | "error" = "success"): void {
    if (this.entry.kind !== "tool-call") {
      return;
    }
    this.entry.result = result;
    this.entry.status = status;
  }

  /**
   * 将工具块切换为等待审批状态。
   *
   * @param approval_id 当前审批请求 ID。
   */
  require_approval(approval_id: string): void {
    if (this.entry.kind !== "tool-call") return;
    this.entry.status = "approval-required";
    this.entry.approval_id = approval_id;
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

    if (safe_width < 8) {
      return [truncateToWidth(this.build_header_label(), safe_width, "…")];
    }

    const inner_width = safe_width - 2;
    lines.push(this.build_top_border(inner_width));

    const detail_lines = this.build_detail_lines();
    const body_lines: string[] = [];
    for (const detail of detail_lines) {
      const colored_detail = current_theme.fg("textDim", detail);
      const rendered = new Text(colored_detail, 0, 0).render(Math.max(1, inner_width - 2));
      for (const line of rendered) {
        body_lines.push(line);
      }
    }

    if (body_lines.length > 0) {
      const visible_body = this.expanded
        ? body_lines
        : body_lines.slice(0, RESULT_PREVIEW_LINES);
      for (const body_line of visible_body) {
        lines.push(this.build_body_line(body_line, inner_width));
      }
      if (!this.expanded && body_lines.length > RESULT_PREVIEW_LINES) {
        const remaining = body_lines.length - RESULT_PREVIEW_LINES;
        lines.push(this.build_body_line(
          current_theme.dim(`... ${remaining} more lines · Ctrl+O expand`),
          inner_width,
        ));
      }
    }

    lines.push(current_theme.fg("border", `└${"─".repeat(inner_width)}┘`));

    return lines.map((line) => truncateToWidth(line, safe_width, "…"));
  }

  /** 构建工具块顶部边框、标题与状态。 */
  private build_top_border(inner_width: number): string {
    const total_width = inner_width + 2;
    const status = this.build_status_mark();
    const fixed_width = visibleWidth(status) + 9;
    const label = truncateToWidth(
      this.build_header_label(),
      Math.max(1, total_width - fixed_width - 1),
      "…",
    );
    const fill_width = Math.max(1, total_width - visibleWidth(label) - fixed_width);
    const border = current_theme.fg("border", "─".repeat(fill_width));
    return `${current_theme.fg("border", "┌─")} ${label} ${border} ${status} ${current_theme.fg("border", "─┐")}`;
  }

  /** 构建工具块正文行。 */
  private build_body_line(content: string, inner_width: number): string {
    const available = Math.max(1, inner_width - 2);
    const visible_content = truncateToWidth(content, available, "…");
    const padding = " ".repeat(Math.max(0, available - visibleWidth(visible_content)));
    const border = current_theme.fg("border", "│");
    return `${border} ${visible_content}${padding} ${border}`;
  }

  /** 构建工具或审批标题。 */
  private build_header_label(): string {
    switch (this.entry.kind) {
      case "tool-call": {
        const tool_label = current_theme.bold_fg("primary", this.entry.tool_name);
        const key_arg = extract_key_argument(this.entry.tool_name, this.entry.args);
        const arg_str = key_arg ? current_theme.dim(` · ${key_arg}`) : "";
        return `${current_theme.bold_fg("textStrong", "Tool")} · ${tool_label}${arg_str}`;
      }
      case "tool-approval-request": {
        const tool_label = current_theme.bold_fg("primary", this.entry.tool_name);
        return `${current_theme.bold_fg("warning", "Approval")} · ${tool_label}`;
      }
      case "tool-approval-result": {
        return `${current_theme.bold_fg("textStrong", "Approval")} · ${this.entry.tool_name}`;
      }
      default:
        return "";
    }
  }

  /** 构建工具块右侧状态标记。 */
  private build_status_mark(): string {
    if (this.entry.kind === "tool-call") {
      if (this.entry.status === "success") return current_theme.fg("success", SUCCESS_MARK.trim());
      if (this.entry.status === "error") return current_theme.fg("error", FAILURE_MARK.trim());
      if (this.entry.status === "approval-required") return current_theme.fg("warning", "!");
      return current_theme.fg("primary", "●");
    }
    if (this.entry.kind === "tool-approval-request") {
      return current_theme.fg("warning", "!");
    }
    const approved = this.entry.decision === "approved";
    return current_theme.fg(approved ? "success" : "error", approved ? "✓" : "✗");
  }

  private build_detail_lines(): string[] {
    switch (this.entry.kind) {
      case "tool-call": {
        const approval = this.entry.status === "approval-required"
          ? [`approval required · ${this.entry.approval_id || "pending"}`]
          : [];
        if (this.entry.result !== undefined) {
          return [...approval, ...this.format_result(this.entry.result)];
        }
        return [...approval, ...this.format_json_args(this.entry.args)];
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
    if (args === undefined) {
      return ["preparing arguments..."];
    }
    if (args === null) {
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
    shell_session: ["cmd", "command", "action", "shell_id"],
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
  return value.slice(0, MAX_KEY_ARG_LENGTH - 3) + "...";
}
