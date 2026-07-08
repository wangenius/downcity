/**
 * JsonlSessionCompactionPrompts：上下文压缩提示词模块。
 *
 * 关键点（中文）
 * - 统一维护 session compact 使用的 system prompt 与 user prompt。
 * - 支持初始压缩、迭代更新压缩、turn prefix 压缩三类场景。
 * - prompt 文本保持结构化格式稳定，便于后续 LLM 继续接力。
 */

/**
 * 上下文压缩 system prompt。
 */
export const SESSION_COMPACTION_SYSTEM_PROMPT = [
  "You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.",
  "",
  "Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.",
].join("\n");

/**
 * 构建初始上下文压缩 prompt。
 */
export function build_initial_session_compaction_prompt(params: {
  /** 待压缩的历史对话文本。 */
  conversation_text: string;
}): string {
  return [
    String(params.conversation_text || "").trim(),
    "",
    "The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.",
    "",
    "Use this EXACT format:",
    "",
    "## Goal",
    "[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]",
    "",
    "## Constraints & Preferences",
    "- [Any constraints, preferences, or requirements mentioned by user]",
    '- [Or "(none)" if none were mentioned]',
    "",
    "## Progress",
    "### Done",
    "- [x] [Completed tasks/changes]",
    "",
    "### In Progress",
    "- [ ] [Current work]",
    "",
    "### Blocked",
    "[Issues preventing progress, if any]",
    "",
    "## Key Decisions",
    "- **[Decision]**: [Brief rationale]",
    "",
    "## Next Steps",
    "1. [Ordered list of what should happen next]",
    "",
    "## Critical Context",
    "- [Any data, examples, or references needed to continue]",
    '- [Or "(none)" if not applicable]',
    "",
    "Keep each section concise. Preserve exact file paths, function names, and error messages.",
  ].join("\n");
}

/**
 * 构建迭代更新上下文压缩 prompt。
 */
export function build_update_session_compaction_prompt(params: {
  /** 已存在的旧摘要。 */
  previous_summary: string;
  /** 本次需要合入旧摘要的新对话文本。 */
  new_conversation_text: string;
}): string {
  return [
    "<previous-summary>",
    String(params.previous_summary || "").trim(),
    "</previous-summary>",
    "",
    String(params.new_conversation_text || "").trim(),
    "",
    "The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.",
    "",
    "Update the existing structured summary with new information. RULES:",
    "- PRESERVE all existing information from the previous summary",
    "- ADD new progress, decisions, and context from the new messages",
    '- UPDATE the Progress section: move items from "In Progress" to "Done" when completed',
    '- UPDATE "Next Steps" based on what was accomplished',
    "- PRESERVE exact file paths, function names, and error messages",
    "- If something is no longer relevant, you may remove it",
    "",
    "Use this EXACT format:",
    "",
    "## Goal",
    "[Preserve existing goals, add new ones if the task expanded]",
    "",
    "## Constraints & Preferences",
    "- [Preserve existing, add new ones discovered]",
    "",
    "## Progress",
    "### Done",
    "- [x] [Include previously done items AND newly completed items]",
    "",
    "### In Progress",
    "- [ ] [Current work - update based on progress]",
    "",
    "### Blocked",
    "[Current blockers - remove if resolved]",
    "",
    "## Key Decisions",
    "- **[Decision]**: [Brief rationale] (preserve all previous, add new)",
    "",
    "## Next Steps",
    "1. [Update based on current state]",
    "",
    "## Critical Context",
    "- [Preserve important context, add new if needed]",
    "",
    "Keep each section concise. Preserve exact file paths, function names, and error messages.",
  ].join("\n");
}

/**
 * 构建 turn prefix 压缩 prompt。
 */
export function build_turn_prefix_session_compaction_prompt(params: {
  /** 被切下来的 turn prefix 文本。 */
  prefix_text: string;
}): string {
  return [
    String(params.prefix_text || "").trim(),
    "",
    "This is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.",
    "",
    "Summarize the prefix to provide context for the retained suffix:",
    "",
    "## Original Request",
    "[What did the user ask for in this turn?]",
    "",
    "## Early Progress",
    "- [Key decisions and work done in the prefix]",
    "",
    "## Context for Suffix",
    "- [Information needed to understand the retained recent work]",
    "",
    "Be concise. Focus on what's needed to understand the kept suffix.",
  ].join("\n");
}

/**
 * 给摘要追加文件操作 XML。
 */
export function append_session_compaction_file_operations(params: {
  /** LLM 生成的结构化摘要。 */
  summary: string;
  /** 文件操作 XML，空字符串时不追加。 */
  file_operations_xml?: string;
}): string {
  const summary = String(params.summary || "").trim();
  const file_operations_xml = String(params.file_operations_xml || "").trim();
  if (!file_operations_xml) return summary;
  if (!summary) return file_operations_xml;
  return `${summary}\n\n${file_operations_xml}`;
}
