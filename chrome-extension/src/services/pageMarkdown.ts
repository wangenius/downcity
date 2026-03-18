/**
 * 页面正文抓取与 Markdown 生成服务。
 *
 * 关键点（中文）：
 * - 在当前活动标签页内提取可见正文（best-effort）。
 * - 将正文整理为可供 Agent 读取的 Markdown 文档。
 */

import type { ActiveTabContext, PageMarkdownSnapshot } from "../types/extension";

const MAX_CAPTURED_TEXT_CHARS = 120_000;
const MAX_MARKDOWN_TEXT_CHARS = 150_000;

type PageExtractResult = {
  title: string;
  url: string;
  text: string;
};

function normalizePageText(input: string): string {
  const text = String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  return text.slice(0, MAX_CAPTURED_TEXT_CHARS);
}

function toMarkdownBody(rawText: string): string {
  const normalized = normalizePageText(rawText);
  if (!normalized) {
    return "（未能提取到正文，请根据页面标题与链接自行打开原文。）";
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return "（未能提取到正文，请根据页面标题与链接自行打开原文。）";
  }

  return paragraphs.join("\n\n").slice(0, MAX_MARKDOWN_TEXT_CHARS).trim();
}

function sanitizeTitle(input: string): string {
  const title = String(input || "").replace(/\s+/g, " ").trim();
  return title || "未命名页面";
}

function sanitizeUrl(input: string): string {
  const url = String(input || "").trim();
  return url || "about:blank";
}

function toSafeFileName(title: string): string {
  const ascii = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  const base = ascii || "web-page";
  return `${base}.md`;
}

function composeMarkdown(params: {
  title: string;
  url: string;
  bodyText: string;
}): string {
  const nowIso = new Date().toISOString();
  return [
    `# ${params.title}`,
    "",
    `> Source: ${params.url}`,
    `> Captured At: ${nowIso}`,
    "",
    "---",
    "",
    params.bodyText,
  ]
    .join("\n")
    .trim();
}

async function extractPageFromTab(tabId: number): Promise<PageExtractResult> {
  const results = await new Promise<chrome.scripting.InjectionResult<PageExtractResult>[]>(
    (resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            const pickRoot = (): HTMLElement | null => {
              const candidates = [
                "article",
                "main",
                "[role='main']",
                "#main",
                "#content",
                ".main-content",
                ".article",
                ".post",
                ".entry-content",
              ];
              for (const selector of candidates) {
                const node = document.querySelector(selector);
                if (!(node instanceof HTMLElement)) continue;
                const text = String(node.innerText || "").trim();
                if (text.length >= 160) return node;
              }
              if (document.body instanceof HTMLElement) return document.body;
              if (document.documentElement instanceof HTMLElement) {
                return document.documentElement;
              }
              return null;
            };

            const root = pickRoot();
            const text = String(root?.innerText || document.body?.innerText || "");
            return {
              title: String(document.title || "").trim(),
              url: String(location.href || "").trim(),
              text,
            };
          },
        },
        (injectionResults) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(injectionResults || []);
        },
      );
    },
  );

  const first = results[0]?.result;
  if (!first || typeof first !== "object") {
    return {
      title: "",
      url: "",
      text: "",
    };
  }
  return {
    title: String(first.title || "").trim(),
    url: String(first.url || "").trim(),
    text: String(first.text || ""),
  };
}

/**
 * 为当前标签页构建 Markdown 快照。
 */
export async function buildPageMarkdownSnapshot(
  tab: ActiveTabContext,
): Promise<PageMarkdownSnapshot> {
  const fallbackTitle = sanitizeTitle(tab.title);
  const fallbackUrl = sanitizeUrl(tab.url);

  let extracted: PageExtractResult = {
    title: fallbackTitle,
    url: fallbackUrl,
    text: "",
  };
  if (typeof tab.tabId === "number") {
    try {
      extracted = await extractPageFromTab(tab.tabId);
    } catch {
      // 关键点（中文）：抓取失败时降级到基础信息，不阻断发送链路。
    }
  }

  const title = sanitizeTitle(extracted.title || fallbackTitle);
  const url = sanitizeUrl(extracted.url || fallbackUrl);
  const bodyText = toMarkdownBody(extracted.text);

  return {
    title,
    url,
    fileName: toSafeFileName(title),
    markdown: composeMarkdown({
      title,
      url,
      bodyText,
    }),
  };
}
