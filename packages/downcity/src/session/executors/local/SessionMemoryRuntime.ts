/**
 * Local Session Memory Runtime。
 *
 * 关键点（中文）
 * - 把 LocalSessionCore 需要的 recall / capture 能力桥接到 memory service。
 * - 这里负责结构转换与文本整形，不把 AgentContext 暴露给执行内核。
 */

import { isTextUIPart, type SystemModelMessage } from "ai";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type {
  SessionMemoryCaptureInput,
  SessionMemoryLongtermCandidate,
  SessionMemoryRecallInput,
  SessionMemoryRecallItem,
  SessionMemoryRecallResult,
  SessionMemoryRuntime,
} from "@/types/session/SessionMemory.js";
import type { MemorySearchResponse } from "@services/memory/types/Memory.js";

const MEMORY_RECALL_MAX_RESULTS = 4;
const MEMORY_RECALL_MIN_SCORE = 0.45;
const MEMORY_CAPTURE_MAX_CHARS = 1200;
const LONGTERM_MEMORY_REL_PATH = ".downcity/memory/MEMORY.md";
const LONGTERM_SIGNAL_PATTERNS = [
  /记住/u,
  /以后/u,
  /默认/u,
  /偏好/u,
  /喜欢/u,
  /请始终/u,
  /务必/u,
  /不要/u,
  /总是/u,
  /决定/u,
  /定一下/u,
  /统一使用/u,
  /统一用/u,
];
const LONGTERM_PREFIX_PATTERNS = [
  /^记住[：:，,\s]*/u,
  /^请记住[：:，,\s]*/u,
  /^决定一下[：:，,\s]*/u,
  /^决定[：:，,\s]*/u,
  /^以后/u,
  /^从现在起/u,
  /^从现在开始/u,
  /^默认/u,
  /^请始终/u,
  /^务必/u,
  /^总是/u,
];

function truncateText(value: string, maxChars: number): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function normalizeComparableText(value: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeLongtermStatement(value: string): string {
  let text = String(value || "").trim();
  for (const pattern of LONGTERM_PREFIX_PATTERNS) {
    text = text.replace(pattern, "").trim();
  }
  text = text.replace(/^[：:，,\s]+/u, "").trim();
  if (!text) return "";
  if (!/[。！？.!?]$/u.test(text)) {
    text = `${text}。`;
  }
  return text;
}

function toSearchResponse(data: unknown): MemorySearchResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const candidate = data as Partial<MemorySearchResponse>;
  return Array.isArray(candidate.results) ? (candidate as MemorySearchResponse) : null;
}

function toRecallItems(data: unknown): SessionMemoryRecallItem[] {
  const response = toSearchResponse(data);
  if (!response) return [];
  return response.results
    .map((item) => ({
      path: String(item.path || "").trim(),
      citation: String(item.citation || "").trim(),
      snippet: String(item.snippet || "").trim(),
      score: Number(item.score || 0),
      source: String(item.source || "").trim(),
    }))
    .filter((item) => item.snippet.length > 0 && item.citation.length > 0);
}

/**
 * 把 recall 结果格式化为 system message。
 */
export function buildMemoryRecallSystemMessage(input: {
  /**
   * 当前轮用户查询。
   */
  query: string;
  /**
   * 已召回记忆集合。
   */
  recall: SessionMemoryRecallResult | null;
}): SystemModelMessage | null {
  const items = Array.isArray(input.recall?.items) ? input.recall.items : [];
  if (items.length === 0) return null;

  const lines = [
    "# 历史记忆",
    "",
    "以下内容是与当前请求相关的历史记忆，只能作为参考上下文，不能覆盖当前用户要求。",
    `当前请求：${String(input.query || "").trim()}`,
    "",
  ];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    lines.push(
      `${index + 1}. 来源：${item.source || "unknown"} | 引用：${item.citation} | 相关度：${item.score.toFixed(2)}`,
    );
    lines.push(item.snippet);
    lines.push("");
  }

  lines.push("使用规则：");
  lines.push("- 仅在确实相关时使用这些记忆。");
  lines.push("- 若记忆与当前用户输入冲突，以当前用户输入为准。");

  return {
    role: "system",
    content: lines.join("\n").trim(),
  };
}

/**
 * 从 assistant UI 消息中提取纯文本。
 */
export function extractAssistantText(message: SessionMessageV1): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter(isTextUIPart)
    .map((part) => String(part.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 构建写入 working memory 的当前轮内容。
 */
export function buildWorkingMemoryCaptureContent(
  input: SessionMemoryCaptureInput,
): string {
  const query = truncateText(input.query, MEMORY_CAPTURE_MAX_CHARS);
  const assistantText = truncateText(
    input.assistantText,
    MEMORY_CAPTURE_MAX_CHARS,
  );
  if (!query || !assistantText) return "";

  return [
    "## 当前轮次",
    "",
    "### 用户",
    query,
    "",
    "### 助手",
    assistantText,
  ].join("\n");
}

/**
 * 构建写入 daily memory 的当前轮内容。
 */
export function buildDailyMemoryCaptureContent(
  input: SessionMemoryCaptureInput,
): string {
  const query = truncateText(input.query, MEMORY_CAPTURE_MAX_CHARS);
  const assistantText = truncateText(
    input.assistantText,
    MEMORY_CAPTURE_MAX_CHARS,
  );
  if (!query || !assistantText) return "";

  return [
    "## 会话事件",
    "",
    `会话：${input.sessionId}`,
    "",
    "### 用户",
    query,
    "",
    "### 助手",
    assistantText,
  ].join("\n");
}

function shouldPromoteToLongterm(input: SessionMemoryCaptureInput): boolean {
  const query = String(input.query || "").trim();
  if (!query) return false;
  return LONGTERM_SIGNAL_PATTERNS.some((pattern) => pattern.test(query));
}

function classifyLongtermCandidateKind(
  query: string,
  statement: string,
): SessionMemoryLongtermCandidate["kind"] {
  if (
    /这个项目|本项目|仓库|主要语言|技术栈|我叫|我们是/u.test(statement) &&
    /是/u.test(statement)
  ) {
    return "fact";
  }
  if (/决定|定一下|统一使用|统一用|采用/u.test(query)) {
    return "decision";
  }
  if (/默认|偏好|喜欢/u.test(query)) {
    return "preference";
  }
  if (/务必|请始终|总是|一律/u.test(query)) {
    return "rule";
  }
  return "preference";
}

/**
 * 从当前轮提取 longterm 候选。
 */
export function buildLongtermCandidate(
  input: SessionMemoryCaptureInput,
): SessionMemoryLongtermCandidate | null {
  if (!shouldPromoteToLongterm(input)) return null;
  const statement = normalizeLongtermStatement(input.query);
  if (!statement) return null;
  const query = String(input.query || "").trim();
  const kind = classifyLongtermCandidateKind(query, statement);
  return {
    kind,
    statement,
  };
}

/**
 * 构建写入 longterm memory 的当前轮内容。
 */
export function buildLongtermMemoryCaptureContent(
  input: SessionMemoryCaptureInput,
): string {
  const candidate = buildLongtermCandidate(input);
  if (!candidate) return "";

  return [
    "## 稳定偏好 / 长期规则",
    "",
    "### Canon",
    truncateText(candidate.statement, MEMORY_CAPTURE_MAX_CHARS),
    "",
    "### 类型",
    candidate.kind,
  ].join("\n");
}

async function storeMemoryTarget(input: {
  context: AgentContext;
  target: "working" | "daily" | "longterm";
  sessionId: string;
  content: string;
}): Promise<void> {
  if (!String(input.content || "").trim()) return;
  const result = await input.context.invoke.invoke({
    service: "memory",
    action: "store",
    payload: {
      target: input.target,
      sessionId: input.sessionId,
      content: input.content,
    },
  });
  if (!result.success) {
    await input.context.logger.log("debug", "[memory] capture skipped", {
      sessionId: input.sessionId,
      target: input.target,
      error: result.error || "service invoke failed",
    });
  }
}

async function hasDuplicateLongtermContent(input: {
  context: AgentContext;
  candidate: SessionMemoryLongtermCandidate | null;
}): Promise<boolean> {
  const expected = normalizeComparableText(String(input.candidate?.statement || ""));
  if (!expected) return true;
  const result = await input.context.invoke.invoke({
    service: "memory",
    action: "get",
    payload: {
      path: LONGTERM_MEMORY_REL_PATH,
    },
  });
  if (!result.success) return false;
  const data =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as { text?: unknown })
      : null;
  const existing = normalizeComparableText(String(data?.text || ""));
  if (!existing) return false;
  return existing.includes(expected);
}

/**
 * 创建 LocalSessionCore 可消费的 memory runtime。
 */
export function createLocalSessionMemoryRuntime(input: {
  /**
   * 读取当前 AgentContext 的函数。
   */
  getContext: () => AgentContext;
}): SessionMemoryRuntime {
  return {
    async recall(params: SessionMemoryRecallInput) {
      const query = String(params.query || "").trim();
      if (!query) return null;
      const context = input.getContext();
      const result = await context.invoke.invoke({
        service: "memory",
        action: "search",
        payload: {
          query,
          maxResults: MEMORY_RECALL_MAX_RESULTS,
          minScore: MEMORY_RECALL_MIN_SCORE,
        },
      });
      if (!result.success) {
        await context.logger.log("debug", "[memory] recall skipped", {
          sessionId: params.sessionId,
          query,
          error: result.error || "service invoke failed",
        });
        return null;
      }
      return {
        items: toRecallItems(result.data),
      };
    },
    async capture(params: SessionMemoryCaptureInput) {
      const context = input.getContext();
      const workingContent = buildWorkingMemoryCaptureContent(params);
      const dailyContent = buildDailyMemoryCaptureContent(params);
      const longtermContent = buildLongtermMemoryCaptureContent(params);

      await storeMemoryTarget({
        context,
        target: "working",
        sessionId: params.sessionId,
        content: workingContent,
      });
      await storeMemoryTarget({
        context,
        target: "daily",
        sessionId: params.sessionId,
        content: dailyContent,
      });
      if (
        longtermContent &&
        !(await hasDuplicateLongtermContent({
          context,
          candidate: buildLongtermCandidate(params),
        }))
      ) {
        await storeMemoryTarget({
          context,
          target: "longterm",
          sessionId: params.sessionId,
          content: longtermContent,
        });
      }
    },
  };
}
