/**
 * JsonlSessionCompactionFileOperations：上下文压缩文件操作记录模块。
 *
 * 关键点（中文）
 * - 从被压缩的 session 消息中 best-effort 提取文件读写痕迹。
 * - 输出结构化 XML 片段，追加到 LLM 生成的 compact summary 末尾。
 * - 解析失败或没有文件操作时不影响 compact 主流程。
 */

import { isTextUIPart } from "ai";
import type { SessionMessageRecordV1 } from "@/executor/types/SessionRecords.js";

/**
 * 压缩范围内的文件操作汇总。
 */
export type SessionCompactionFileOperations = {
  /** 本次压缩范围内被读取或查看过的文件路径。 */
  read_files: string[];
  /** 本次压缩范围内被新增、修改或删除过的文件路径。 */
  modified_files: string[];
};

type UnknownRecord = Record<string, unknown>;

const PATH_CANDIDATE_RE =
  /(?:\.{1,2}\/|\/|[A-Za-z0-9_.@-]+\/)[A-Za-z0-9_.@~:+/=-]+/g;
const PATCH_FILE_RE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
const GIT_STATUS_FILE_RE = /^\s*(?:[MADRCU?!]{1,2}|[ MADRCU?!][ MADRCU?!])\s+(.+)$/gm;
const READ_COMMAND_RE =
  /\b(?:cat|less|more|sed|nl|head|tail|rg|grep|find|ls|wc|stat|open|git\s+(?:show|diff|status|grep|ls-files))\b/;

/**
 * 把压缩范围内的文件操作格式化为 XML。
 */
export function format_session_compaction_file_operations(
  messages: SessionMessageRecordV1[],
): string {
  const operations = collect_session_compaction_file_operations(messages);
  if (operations.read_files.length === 0 && operations.modified_files.length === 0) {
    return "";
  }
  return [
    "<read-files>",
    ...operations.read_files.map((file_path) => xml_escape(file_path)),
    "</read-files>",
    "",
    "<modified-files>",
    ...operations.modified_files.map((file_path) => xml_escape(file_path)),
    "</modified-files>",
  ].join("\n");
}

/**
 * 收集压缩范围内的文件操作。
 */
export function collect_session_compaction_file_operations(
  messages: SessionMessageRecordV1[],
): SessionCompactionFileOperations {
  const read_files = new Set<string>();
  const modified_files = new Set<string>();

  for (const message of Array.isArray(messages) ? messages : []) {
    const text_blocks = extract_message_operation_texts(message);
    for (const text of text_blocks) {
      for (const file_path of extract_modified_files(text)) {
        modified_files.add(file_path);
      }
      for (const file_path of extract_read_files(text)) {
        read_files.add(file_path);
      }
    }
  }

  for (const file_path of modified_files) {
    read_files.delete(file_path);
  }

  return {
    read_files: [...read_files].sort(),
    modified_files: [...modified_files].sort(),
  };
}

/**
 * 提取单条消息中可能包含文件操作的文本块。
 */
function extract_message_operation_texts(message: SessionMessageRecordV1): string[] {
  const out: string[] = [];
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    if (isTextUIPart(part)) {
      const text = String(part.text ?? "").trim();
      if (text) out.push(text);
      continue;
    }
    const part_record = to_record(part);
    if (!part_record) continue;
    const input_text = stringify_compact(part_record.input);
    const output_text = stringify_compact(part_record.output);
    const error_text = stringify_compact(part_record.errorText);
    if (input_text) out.push(input_text);
    if (output_text) out.push(output_text);
    if (error_text) out.push(error_text);
  }
  return out;
}

/**
 * 提取 patch / git status 中的修改文件。
 */
function extract_modified_files(text: string): string[] {
  const out = new Set<string>();
  for (const file_path of match_group_values(text, PATCH_FILE_RE)) {
    const normalized = normalize_file_path(file_path);
    if (normalized) out.add(normalized);
  }
  for (const file_path of match_group_values(text, GIT_STATUS_FILE_RE)) {
    const normalized = normalize_file_path(file_path);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

/**
 * 从读命令文本中提取读取路径。
 */
function extract_read_files(text: string): string[] {
  const out = new Set<string>();
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!READ_COMMAND_RE.test(line)) continue;
    for (const candidate of line.match(PATH_CANDIDATE_RE) || []) {
      const normalized = normalize_file_path(candidate);
      if (normalized) out.add(normalized);
    }
  }
  return [...out];
}

/**
 * 获取正则第一个捕获组的所有结果。
 */
function match_group_values(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    const value = String(match[1] || "").trim();
    if (value) out.push(value);
    match = pattern.exec(text);
  }
  return out;
}

/**
 * 归一化候选路径。
 */
function normalize_file_path(value: string): string {
  let file_path = String(value || "").trim();
  if (!file_path || file_path.includes("://")) return "";
  file_path = file_path.replace(/^["'`]+|["'`]+$/g, "");
  file_path = file_path.replace(/[),.;:]+$/g, "");
  if (!file_path || file_path === "." || file_path === "..") return "";
  if (file_path.startsWith("-")) return "";
  return file_path;
}

/**
 * 转成对象记录。
 */
function to_record(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

/**
 * 将未知结构紧凑地转为文本。
 */
function stringify_compact(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * XML 文本转义。
 */
function xml_escape(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
