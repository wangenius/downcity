/**
 * CLI Reporter：统一渲染 city 命令行输出。
 *
 * 关键点（中文）
 * - 为 lifecycle 类命令提供稳定、统一、层级清晰的文本版式。
 * - 将颜色、符号、对齐规则集中在这里，避免命令文件继续散落 `console.log` 模板串。
 * - 保持纯函数输出，方便测试并保证非 TTY 场景仍可读。
 */

import chalk, { Chalk as ChalkConstructor } from "chalk";
import type {
  CliRenderOptions,
  CliReportBlock,
  CliReportFact,
  CliReportList,
  CliReportListItem,
  CliReportTone,
} from "@/types/cli/CliReporter.js";

const FACT_LABEL_MIN_WIDTH = 8;
const HEADLINE_WIDTH = 60;
let cliSectionPrinted = false;
let cliPreviousSectionCompact = false;

/**
 * CLI 语气对应的视觉调色板。
 */
type CliTonePalette = {
  /**
   * 当前语气的标题颜色。
   */
  title: (text: string) => string;
  /**
   * 当前语气的状态颜色。
   */
  status: (text: string) => string;
};

/**
 * 解析当前渲染应使用的 chalk 实例。
 */
function resolveChalk(options?: CliRenderOptions): typeof chalk {
  if (options?.color === true) {
    return new ChalkConstructor({ level: 1 });
  }
  if (options?.color === false) {
    return new ChalkConstructor({ level: 0 });
  }
  return chalk;
}

/**
 * 解析语气对应的完整视觉调色板。
 */
function resolveTonePalette(
  tone: CliReportTone,
  palette: typeof chalk,
): CliTonePalette {
  switch (tone) {
    case "success":
      return {
        title: palette.bold,
        status: palette.green,
      };
    case "warning":
      return {
        title: palette.bold,
        status: palette.yellow,
      };
    case "error":
      return {
        title: palette.bold,
        status: palette.red,
      };
    case "accent":
      return {
        title: palette.bold,
        status: palette.cyan,
      };
    case "info":
    default:
      return {
        title: palette.bold,
        status: palette.blue,
      };
  }
}

/**
 * 计算详情标签列宽。
 */
function resolveFactLabelWidth(facts: CliReportFact[]): number {
  return facts.reduce((maxWidth, item) => {
    return Math.max(
      maxWidth,
      normalizeFactLabel(String(item.label || "").trim()).length,
    );
  }, FACT_LABEL_MIN_WIDTH);
}

/**
 * 规范化详情标签。
 */
function normalizeFactLabel(label: string): string {
  return String(label || "").trim().toLowerCase();
}

/**
 * 渲染详情键值对行。
 */
function formatFactLines(
  facts: CliReportFact[],
  indent: string,
  options?: CliRenderOptions,
): string[] {
  const palette = resolveChalk(options);
  const labelWidth = resolveFactLabelWidth(facts);
  return facts.map((item) => {
    const label = normalizeFactLabel(String(item.label || "")).padEnd(labelWidth, " ");
    const value = formatFactValue(item.value, options);
    return `${indent}${palette.dim(label)}  ${value}`;
  });
}

/**
 * 渲染标题行。
 */
function formatHeadingLine(params: {
  tone: CliReportTone;
  title: string;
  summary?: string;
  options?: CliRenderOptions;
}): string {
  const palette = resolveChalk(params.options);
  const tonePalette = resolveTonePalette(params.tone, palette);
  const title = tonePalette.title(params.title);
  if (!params.summary) {
    return title;
  }
  const plainSummary = String(params.summary || "").trim().toLowerCase();
  const spacing = Math.max(
    2,
    HEADLINE_WIDTH - params.title.length - plainSummary.length,
  );
  return `${title}${" ".repeat(spacing)}${tonePalette.status(plainSummary)}`;
}

/**
 * 根据值内容做轻量语义高亮。
 */
function formatFactValue(
  value: string,
  options?: CliRenderOptions,
): string {
  const palette = resolveChalk(options);
  const normalized = String(value || "");
  if (/^https?:\/\//.test(normalized)) {
    return palette.underline(normalized);
  }
  if (/^(started|stopped|ready|running)$/i.test(normalized)) {
    return palette.green(normalized);
  }
  if (/^(already stopped|foreground)$/i.test(normalized)) {
    return palette.blue(normalized);
  }
  if (/^(error|failed)$/i.test(normalized)) {
    return palette.red(normalized);
  }
  return normalized;
}

/**
 * 渲染单个信息区块。
 */
export function formatCliBlock(
  block: CliReportBlock,
  options?: CliRenderOptions,
): string {
  const tone = block.tone || "info";
  const palette = resolveChalk(options);
  const lines = [
    formatHeadingLine({
      tone,
      title: block.title,
      summary: block.summary,
      options,
    }),
  ];

  if (Array.isArray(block.facts) && block.facts.length > 0) {
    lines.push(...formatFactLines(block.facts, "  ", options));
  }
  if (block.note) {
    const noteLabel = normalizeFactLabel("note").padEnd(
      Math.max(FACT_LABEL_MIN_WIDTH, "note".length),
      " ",
    );
    lines.push(`  ${palette.dim(noteLabel)}  ${block.note}`);
  }

  return lines.join("\n");
}

/**
 * 渲染列表项。
 */
function formatCliListItem(
  item: CliReportListItem,
  options?: CliRenderOptions,
): string[] {
  const tone = item.tone || "info";
  const lines = [
    `  ${formatHeadingLine({
      tone,
      title: item.title,
      options,
    })}`,
  ];
  if (Array.isArray(item.facts) && item.facts.length > 0) {
    lines.push(...formatFactLines(item.facts, "    ", options));
  }
  return lines;
}

/**
 * 渲染列表分组。
 */
export function formatCliList(
  list: CliReportList,
  options?: CliRenderOptions,
): string {
  const tone = list.tone || "accent";
  const lines = [
    formatHeadingLine({
      tone,
      title: list.title,
      summary: list.summary,
      options,
    }),
  ];

  for (const item of list.items) {
    lines.push(...formatCliListItem(item, options));
  }

  return lines.join("\n");
}

/**
 * 重置当前命令的输出分组节奏。
 *
 * 关键点（中文）
 * - 每次新的 CLI 命令开始输出前都应先重置。
 * - 这样不同命令之间不会串联复用上一条命令的留白状态。
 */
export function resetCliSectionFlow(): void {
  cliSectionPrinted = false;
  cliPreviousSectionCompact = false;
}

/**
 * 以统一节奏输出一个 section。
 *
 * 关键点（中文）
 * - 第二个 section 起会自动插入一个空行，拉开模块层级。
 * - 只负责打印节奏，不参与格式拼装。
 */
function emitCliSection(text: string, compact: boolean): void {
  if (cliSectionPrinted && !(cliPreviousSectionCompact && compact)) {
    console.log("");
  }
  console.log(text);
  cliSectionPrinted = true;
  cliPreviousSectionCompact = compact;
}

/**
 * 判断 block 是否属于紧凑步骤行。
 */
function isCompactCliBlock(block: CliReportBlock): boolean {
  return (!block.facts || block.facts.length === 0) && !block.note;
}

/**
 * 判断 list 是否属于紧凑列表。
 */
function isCompactCliList(list: CliReportList): boolean {
  return list.items.every((item) => !item.facts || item.facts.length === 0);
}

/**
 * 输出 header section。
 */
export function emitCliHeader(
  version: string,
  options?: CliRenderOptions,
): void {
  emitCliSection(formatCliHeader(version, options), false);
}

/**
 * 输出 block section。
 */
export function emitCliBlock(
  block: CliReportBlock,
  options?: CliRenderOptions,
): void {
  emitCliSection(formatCliBlock(block, options), isCompactCliBlock(block));
}

/**
 * 输出 list section。
 */
export function emitCliList(
  list: CliReportList,
  options?: CliRenderOptions,
): void {
  emitCliSection(formatCliList(list, options), isCompactCliList(list));
}

/**
 * 渲染命令顶部 banner。
 */
export function formatCliHeader(
  version: string,
  options?: CliRenderOptions,
): string {
  const palette = resolveChalk(options);
  return `${palette.bold("downcity")} ${palette.dim(`v${version}`)}`;
}
