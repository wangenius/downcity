/**
 * 页面内容抓取与 Markdown 生成服务。
 *
 * 关键点（中文）：
 * - 在当前活动标签页内提取“结构化内容”（而不是单纯 innerText）。
 * - 支持标题、段落、列表、表格、引用、代码块等常见网页结构。
 * - 当页面存在多个主体区块（例如多 article / feed）时按区块合并输出。
 */

import type { ActiveTabContext, PageMarkdownSnapshot } from "../types/extension";

const MAX_CAPTURED_TEXT_CHARS = 120_000;
const MAX_MARKDOWN_TEXT_CHARS = 150_000;

type PageExtractResult = {
  title: string;
  url: string;
  markdown: string;
};

function normalizeMarkdownText(input: string): string {
  const normalized = String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, MAX_CAPTURED_TEXT_CHARS);
}

function toMarkdownBody(rawMarkdown: string): string {
  const normalized = normalizeMarkdownText(rawMarkdown);
  if (!normalized) {
    return "（未能提取到可读内容，请根据页面标题与链接自行打开原文。）";
  }

  return normalized.slice(0, MAX_MARKDOWN_TEXT_CHARS).trim();
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
            const MAX_BLOCK_COUNT = 2400;
            const BLOCK_TAGS = new Set([
              "address",
              "article",
              "aside",
              "blockquote",
              "details",
              "div",
              "dl",
              "fieldset",
              "figcaption",
              "figure",
              "footer",
              "form",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "header",
              "hr",
              "li",
              "main",
              "nav",
              "ol",
              "p",
              "pre",
              "section",
              "summary",
              "table",
              "ul",
            ]);
            const DROP_TAGS = new Set([
              "canvas",
              "embed",
              "iframe",
              "input",
              "noscript",
              "script",
              "select",
              "style",
              "svg",
              "textarea",
              "video",
            ]);
            const DROP_SELECTORS = [
              "[aria-hidden='true']",
              "[hidden]",
              "[role='dialog']",
              "[role='menu']",
              "[role='navigation']",
              ".advertisement",
              ".ads",
              ".banner",
              ".cookie",
              ".footer",
              ".header",
              ".nav",
              ".sidebar",
            ];

            function escapeMarkdown(text: string): string {
              return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
            }

            function cleanPlainText(text: string): string {
              return String(text || "").replace(/\s+/g, " ").trim();
            }

            function normalizeLineBreaks(text: string): string {
              return String(text || "")
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n")
                .replace(/[ \t]+\n/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
            }

            function isVisible(element: Element): boolean {
              if (!(element instanceof HTMLElement)) return true;
              if (element.hidden) return false;
              const style = window.getComputedStyle(element);
              if (!style) return true;
              if (style.display === "none") return false;
              if (style.visibility === "hidden") return false;
              if (style.opacity === "0") return false;
              return true;
            }

            function matchesDropSelector(element: Element): boolean {
              for (const selector of DROP_SELECTORS) {
                if (element.matches(selector)) return true;
              }
              return false;
            }

            function shouldDropElement(element: Element): boolean {
              const tag = element.tagName.toLowerCase();
              if (DROP_TAGS.has(tag)) return true;
              if (matchesDropSelector(element)) return true;
              return !isVisible(element);
            }

            function resolveAbsoluteUrl(input: string): string {
              const raw = String(input || "").trim();
              if (!raw) return "";
              try {
                return new URL(raw, location.href).toString();
              } catch {
                return raw;
              }
            }

            function pickLargestSrcsetCandidate(input: string): string {
              const items = String(input || "")
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              if (items.length < 1) return "";

              let bestUrl = "";
              let bestScore = -1;
              for (const item of items) {
                const [urlPart, descriptor] = item.split(/\s+/, 2);
                const score = descriptor?.endsWith("w")
                  ? Number.parseInt(descriptor.slice(0, -1), 10)
                  : descriptor?.endsWith("x")
                    ? Number.parseFloat(descriptor.slice(0, -1)) * 1000
                    : 0;
                if (score > bestScore) {
                  bestUrl = urlPart || "";
                  bestScore = score;
                }
              }
              return bestUrl;
            }

            function resolveImageSource(element: Element): string {
              if (!(element instanceof HTMLImageElement)) return "";
              const candidates = [
                element.currentSrc,
                element.getAttribute("src"),
                element.getAttribute("data-src"),
                element.getAttribute("data-original"),
                element.getAttribute("data-lazy-src"),
                element.getAttribute("data-url"),
                element.getAttribute("data-image"),
                pickLargestSrcsetCandidate(element.getAttribute("srcset") || ""),
                pickLargestSrcsetCandidate(element.getAttribute("data-srcset") || ""),
              ];

              for (const candidate of candidates) {
                const resolved = resolveAbsoluteUrl(String(candidate || ""));
                if (resolved) return resolved;
              }
              return "";
            }

            function resolveImageAlt(element: Element): string {
              const figure = element.closest("figure");
              const figcaption = figure?.querySelector("figcaption");
              return cleanPlainText(
                element.getAttribute("alt") ||
                  element.getAttribute("title") ||
                  figcaption?.textContent ||
                  "image",
              );
            }

            function measureLinkDensity(element: Element): number {
              const textLength = cleanPlainText(element.textContent || "").length;
              if (textLength < 1) return 0;
              const linkLength = Array.from(element.querySelectorAll("a"))
                .map((link) => cleanPlainText(link.textContent || "").length)
                .reduce((sum, item) => sum + item, 0);
              return Math.min(1, linkLength / textLength);
            }

            function computeRootScore(element: Element): {
              element: Element;
              score: number;
              textLength: number;
            } | null {
              if (shouldDropElement(element)) return null;
              const textLength = cleanPlainText(element.textContent || "").length;
              if (textLength < 200) return null;

              const paragraphCount = element.querySelectorAll("p").length;
              const headingCount = element.querySelectorAll("h1,h2,h3").length;
              const imageCount = element.querySelectorAll("img").length;
              const listCount = element.querySelectorAll("li").length;
              const linkDensity = measureLinkDensity(element);
              const tag = element.tagName.toLowerCase();

              let score = 0;
              score += Math.min(420, textLength * 0.025);
              score += Math.min(180, paragraphCount * 18);
              score += Math.min(72, listCount * 4);
              score += Math.min(64, imageCount * 8);
              score += headingCount > 0 ? 90 : 0;
              score -= linkDensity * 260;

              if (tag === "main") score += 180;
              if (tag === "article") score += 160;
              if (element.matches("[role='main']")) score += 160;
              if (element.id === "main" || element.id === "content") score += 120;
              if (element.matches(".content, .article, .post, .entry-content")) score += 90;
              if (element.matches(".feed, .list")) score -= 30;

              return { element, score, textLength };
            }

            function pickLanguage(className: string): string {
              const match = String(className || "").match(
                /(?:language|lang)-([a-z0-9_+-]+)/i,
              );
              return match ? match[1].toLowerCase() : "";
            }

            function toCodeInline(text: string): string {
              const raw = String(text || "").replace(/\n+/g, " ").trim();
              if (!raw) return "";
              if (!raw.includes("`")) return `\`${raw}\``;
              return `\`\`${raw}\`\``;
            }

            function renderInline(node: Node): string {
              if (node.nodeType === Node.TEXT_NODE) {
                return escapeMarkdown(cleanPlainText(node.textContent || ""));
              }
              if (!(node instanceof Element)) return "";
              if (shouldDropElement(node)) return "";

              const tag = node.tagName.toLowerCase();
              if (tag === "br") return "  \n";
              if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
                return toCodeInline(node.textContent || "");
              }
              if (tag === "img") {
                const src = resolveImageSource(node);
                if (!src) return "";
                const alt = resolveImageAlt(node) || "image";
                return `![${escapeMarkdown(alt || "image")}](${src})`;
              }

              const childrenText = Array.from(node.childNodes)
                .map((child) => renderInline(child))
                .join("");
              const text = childrenText.replace(/[ \t]{2,}/g, " ").trim();

              if (!text && tag !== "a") return "";
              if (tag === "a") {
                const href = String(node.getAttribute("href") || "").trim();
                if (!href || href.startsWith("javascript:")) return text;
                const label = text || href;
                return `[${label}](${href})`;
              }
              if (tag === "strong" || tag === "b") return `**${text}**`;
              if (tag === "em" || tag === "i") return `*${text}*`;
              if (tag === "del" || tag === "s") return `~~${text}~~`;

              return text;
            }

            function renderInlineChildren(node: Element): string {
              const text = Array.from(node.childNodes)
                .map((child) => renderInline(child))
                .join("");
              return text.replace(/[ \t]{2,}/g, " ").trim();
            }

            function splitInlineAndNestedList(item: Element): {
              line: string;
              nested: Element[];
            } {
              const nested: Element[] = [];
              const inlineParts: string[] = [];
              for (const child of Array.from(item.childNodes)) {
                if (child instanceof Element) {
                  const childTag = child.tagName.toLowerCase();
                  if (childTag === "ul" || childTag === "ol") {
                    nested.push(child);
                    continue;
                  }
                }
                inlineParts.push(renderInline(child));
              }
              return {
                line: inlineParts.join(" ").replace(/[ \t]{2,}/g, " ").trim(),
                nested,
              };
            }

            function renderList(listElement: Element, depth: number): string {
              const ordered = listElement.tagName.toLowerCase() === "ol";
              const lines: string[] = [];
              const children = Array.from(listElement.children).filter(
                (item) => item.tagName.toLowerCase() === "li",
              );
              for (let index = 0; index < children.length; index += 1) {
                const item = children[index];
                const parsed = splitInlineAndNestedList(item);
                const marker = ordered ? `${index + 1}.` : "-";
                const indent = "  ".repeat(Math.max(0, depth));
                const line = parsed.line || "（空项）";
                lines.push(`${indent}${marker} ${line}`);
                for (const nested of parsed.nested) {
                  const nestedMd = renderList(nested, depth + 1).trim();
                  if (nestedMd) lines.push(nestedMd);
                }
              }
              if (lines.length === 0) return "";
              return `${lines.join("\n")}\n\n`;
            }

            function toTableRows(table: Element): string[][] {
              const rows = Array.from(table.querySelectorAll("tr"));
              const matrix: string[][] = [];
              for (const row of rows) {
                const cells = Array.from(row.querySelectorAll("th,td"))
                  .map((cell) => renderInlineChildren(cell))
                  .map((cell) => cell.replace(/\|/g, "\\|").trim());
                if (cells.some(Boolean)) matrix.push(cells);
              }
              return matrix;
            }

            function renderTable(table: Element): string {
              const rows = toTableRows(table);
              if (rows.length === 0) return "";

              const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
              const normalized = rows.map((row) => {
                const next = row.slice();
                while (next.length < maxCols) next.push("");
                return next;
              });

              const header = normalized[0];
              const body = normalized.slice(1);
              const separator = new Array(maxCols).fill("---");
              const lines = [
                `| ${header.join(" | ")} |`,
                `| ${separator.join(" | ")} |`,
                ...body.map((row) => `| ${row.join(" | ")} |`),
              ];
              return `${lines.join("\n")}\n\n`;
            }

            function renderDescriptionList(list: Element): string {
              const lines: string[] = [];
              const children = Array.from(list.children);
              let currentTerm = "";
              for (const child of children) {
                const tag = child.tagName.toLowerCase();
                if (tag === "dt") {
                  currentTerm = renderInlineChildren(child);
                  continue;
                }
                if (tag !== "dd") continue;
                const desc = renderInlineChildren(child);
                if (!desc) continue;
                if (currentTerm) {
                  lines.push(`- **${currentTerm}**: ${desc}`);
                } else {
                  lines.push(`- ${desc}`);
                }
              }
              if (lines.length === 0) return "";
              return `${lines.join("\n")}\n\n`;
            }

            function renderBlock(element: Element, depth: number): string {
              if (shouldDropElement(element)) return "";
              const tag = element.tagName.toLowerCase();
              if (tag === "li") return "";

              if (tag === "pre") {
                const codeNode = element.querySelector("code");
                const language = pickLanguage(
                  codeNode?.getAttribute("class") || element.getAttribute("class") || "",
                );
                const codeText = normalizeLineBreaks(
                  codeNode?.textContent || element.textContent || "",
                );
                if (!codeText) return "";
                return `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
              }

              if (tag === "blockquote") {
                const content = normalizeLineBreaks(
                  renderChildren(element, depth + 1) || renderInlineChildren(element),
                );
                if (!content) return "";
                const quoted = content
                  .split("\n")
                  .map((line) => (line ? `> ${line}` : ">"))
                  .join("\n");
                return `${quoted}\n\n`;
              }

              if (tag === "table") return renderTable(element);
              if (tag === "ul" || tag === "ol") return renderList(element, depth);
              if (tag === "dl") return renderDescriptionList(element);
              if (tag === "hr") return "---\n\n";

              if (/^h[1-6]$/.test(tag)) {
                const level = Number(tag.slice(1));
                const heading = renderInlineChildren(element);
                if (!heading) return "";
                return `${"#".repeat(level)} ${heading}\n\n`;
              }

              if (tag === "img") {
                const src = resolveImageSource(element);
                if (!src) return "";
                const alt = renderInlineChildren(element) || resolveImageAlt(element) || "image";
                return `![${escapeMarkdown(cleanPlainText(alt) || "image")}](${src})\n\n`;
              }

              if (tag === "p" || tag === "summary" || tag === "figcaption") {
                const paragraph = renderInlineChildren(element);
                if (!paragraph) return "";
                return `${paragraph}\n\n`;
              }

              if (!BLOCK_TAGS.has(tag)) {
                const inline = renderInlineChildren(element);
                if (!inline) return "";
                return `${inline}\n\n`;
              }

              return renderChildren(element, depth + 1);
            }

            function renderChildren(root: Element, depth: number): string {
              const blocks: string[] = [];
              const children = Array.from(root.childNodes);
              for (const child of children) {
                if (blocks.length >= MAX_BLOCK_COUNT) break;
                if (child.nodeType === Node.TEXT_NODE) {
                  const inline = escapeMarkdown(cleanPlainText(child.textContent || ""));
                  if (inline) blocks.push(`${inline}\n\n`);
                  continue;
                }
                if (!(child instanceof Element)) continue;
                const blockText = renderBlock(child, depth);
                if (blockText.trim()) blocks.push(blockText);
              }
              return blocks.join("");
            }

            function collectCandidateRoots(): Element[] {
              const selectors = [
                "main",
                "article",
                "[role='main']",
                "#main",
                "#content",
                ".content",
                ".article",
                ".post",
                ".entry-content",
                ".feed",
                ".list",
              ];
              const candidates: Array<{
                element: Element;
                score: number;
                textLength: number;
              }> = [];
              for (const selector of selectors) {
                const nodes = Array.from(document.querySelectorAll(selector));
                for (const node of nodes) {
                  if (!(node instanceof Element)) continue;
                  const candidate = computeRootScore(node);
                  if (!candidate) continue;
                  candidates.push(candidate);
                }
              }

              candidates.sort((left, right) => {
                if (left.score !== right.score) return right.score - left.score;
                return right.textLength - left.textLength;
              });

              const selected: typeof candidates = [];
              const topScore = candidates[0]?.score || 0;
              for (const candidate of candidates) {
                const overlaps = selected.some(
                  (existing) =>
                    existing.element === candidate.element ||
                    existing.element.contains(candidate.element) ||
                    candidate.element.contains(existing.element),
                );
                if (overlaps) continue;
                if (
                  selected.length > 0 &&
                  candidate.score < topScore * 0.72 &&
                  candidate.textLength < 1600
                ) {
                  continue;
                }
                selected.push(candidate);
                if (selected.length >= 4) break;
              }

              if (selected.length > 0) return selected.map((item) => item.element);
              if (document.body instanceof Element) return [document.body];
              if (document.documentElement instanceof Element) return [document.documentElement];
              return [];
            }

            function renderRootWithTitle(root: Element, index: number): string {
              const raw = renderChildren(root, 0);
              const body = normalizeLineBreaks(raw);
              if (!body) return "";
              const headingNode = root.querySelector("h1,h2,h3");
              const rootHeading = cleanPlainText(headingNode?.textContent || "");
              if (index === 0) return `${body}\n`;
              if (rootHeading) {
                return `## ${escapeMarkdown(rootHeading)}\n\n${body}\n`;
              }
              return `## 区块 ${index + 1}\n\n${body}\n`;
            };

            const roots = collectCandidateRoots();
            const sections = roots
              .map((root, index) => renderRootWithTitle(root, index))
              .filter(Boolean);
            const markdown = normalizeLineBreaks(sections.join("\n"));

            return {
              title: String(document.title || "").trim(),
              url: String(location.href || "").trim(),
              markdown,
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
      markdown: "",
    };
  }
  return {
    title: String(first.title || "").trim(),
    url: String(first.url || "").trim(),
    markdown: String(first.markdown || ""),
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
    markdown: "",
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
  const bodyText = toMarkdownBody(extracted.markdown);

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
