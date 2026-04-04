/**
 * Inline Composer 页面上下文提取服务。
 *
 * 关键点（中文）：
 * - 为页内输入框提供选区、整页正文与图片引用的统一提取逻辑。
 * - 相比旧实现，不再只取第一个 `article/main`，而是按“正文质量”打分选根节点。
 */

import {
  MAX_PAGE_IMAGE_COUNT,
  MAX_PAGE_TEXT_CHARS,
  MAX_SELECTION_TEXT_CHARS,
} from "./constants";
import { normalizeText } from "./helpers";
import type {
  PageContentSnapshot,
  PageImageReference,
  SafePageMeta,
  SelectionRectSnapshot,
} from "../types/inlineComposer";

const ROOT_SELECTORS = [
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

const IMAGE_SOURCE_ATTRIBUTES = [
  "src",
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-url",
  "data-image",
];

type RootCandidate = {
  element: Element;
  score: number;
  textLength: number;
};

/**
 * 读取当前选区矩形。
 */
export function getSelectionRangeRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return rect;
  }

  // 关键点（中文）：部分页面会返回空 rect，这里退化到最后一个 client rect。
  const rects = Array.from(range.getClientRects()).filter(
    (item) => item && (item.width > 0 || item.height > 0),
  );
  if (rects.length > 0) {
    return rects[rects.length - 1] || null;
  }

  const anchorElement =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement || null;
  if (anchorElement) {
    const fallbackRect = anchorElement.getBoundingClientRect();
    if (fallbackRect && (fallbackRect.width > 0 || fallbackRect.height > 0)) {
      return fallbackRect;
    }
  }
  return rect;
}

/**
 * 读取当前选区所有矩形。
 */
export function getSelectionRangeRects(): SelectionRectSnapshot[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return [];
  }
  const range = selection.getRangeAt(0);
  return Array.from(range.getClientRects())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }));
}

/**
 * 读取当前选区文本。
 */
export function getCurrentSelectionText(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return "";
  }
  return normalizeText(selection.toString(), MAX_SELECTION_TEXT_CHARS);
}

function cleanNodeText(input: string): string {
  return String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return true;
  if (element.hidden) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;
  return true;
}

function shouldIgnoreRoot(element: Element): boolean {
  if (!isVisibleElement(element)) return true;
  if (
    element.matches(
      "nav, aside, footer, header, [role='navigation'], [role='dialog'], [hidden], [aria-hidden='true']",
    )
  ) {
    return true;
  }
  const className = String((element as HTMLElement).className || "");
  return /(nav|menu|sidebar|footer|header|cookie|advert|promo)/i.test(className);
}

function measureLinkDensity(element: Element): number {
  const textLength = cleanNodeText(element.textContent || "").length;
  if (textLength < 1) return 0;
  const linkTextLength = Array.from(element.querySelectorAll("a"))
    .map((link) => cleanNodeText(link.textContent || "").length)
    .reduce((sum, item) => sum + item, 0);
  return Math.min(1, linkTextLength / textLength);
}

function computeRootScore(element: Element): RootCandidate | null {
  if (shouldIgnoreRoot(element)) return null;
  const textLength = cleanNodeText(element.textContent || "").length;
  if (textLength < 200) return null;

  const paragraphCount = element.querySelectorAll("p").length;
  const headingCount = element.querySelectorAll("h1, h2, h3").length;
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

  return {
    element,
    score,
    textLength,
  };
}

function collectRootCandidates(): RootCandidate[] {
  const candidateMap = new Map<Element, RootCandidate>();

  for (const selector of ROOT_SELECTORS) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      const candidate = computeRootScore(node);
      if (!candidate) continue;
      const previous = candidateMap.get(node);
      if (!previous || previous.score < candidate.score) {
        candidateMap.set(node, candidate);
      }
    }
  }

  if (candidateMap.size < 1 && document.body instanceof Element) {
    const fallback = computeRootScore(document.body);
    if (fallback) candidateMap.set(document.body, fallback);
  }

  return Array.from(candidateMap.values()).sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return right.textLength - left.textLength;
  });
}

function selectBestRoots(): Element[] {
  const candidates = collectRootCandidates();
  if (candidates.length < 1) {
    if (document.body instanceof Element) return [document.body];
    if (document.documentElement instanceof Element) return [document.documentElement];
    return [];
  }

  const topScore = candidates[0]?.score || 0;
  const selected: RootCandidate[] = [];

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

  return selected.map((item) => item.element);
}

function resolveAbsoluteUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, window.location.href).toString();
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

function resolveImageSource(image: HTMLImageElement): string {
  const candidates = [
    image.currentSrc,
    image.getAttribute("src"),
    image.getAttribute("data-src"),
    image.getAttribute("data-original"),
    image.getAttribute("data-lazy-src"),
    image.getAttribute("data-url"),
    image.getAttribute("data-image"),
    pickLargestSrcsetCandidate(image.getAttribute("srcset") || ""),
    pickLargestSrcsetCandidate(image.getAttribute("data-srcset") || ""),
  ];

  for (const candidate of candidates) {
    const resolved = resolveAbsoluteUrl(String(candidate || ""));
    if (resolved) return resolved;
  }

  for (const attr of IMAGE_SOURCE_ATTRIBUTES) {
    const resolved = resolveAbsoluteUrl(image.getAttribute(attr) || "");
    if (resolved) return resolved;
  }
  return "";
}

function normalizeImageText(image: HTMLImageElement): string {
  const figure = image.closest("figure");
  const figcaption = figure?.querySelector("figcaption");
  const text = cleanNodeText(
    image.getAttribute("alt") ||
      image.getAttribute("title") ||
      figcaption?.textContent ||
      "",
  );
  return text || "image";
}

function extractImagesFromRoots(roots: Element[]): PageImageReference[] {
  const out: PageImageReference[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const images = Array.from(root.querySelectorAll("img"));
    for (const image of images) {
      if (!(image instanceof HTMLImageElement)) continue;
      if (!isVisibleElement(image)) continue;
      const url = resolveImageSource(image);
      if (!url || seen.has(url)) continue;

      seen.add(url);
      out.push({
        url,
        alt: normalizeImageText(image),
        title: cleanNodeText(image.getAttribute("title") || ""),
      });

      if (out.length >= MAX_PAGE_IMAGE_COUNT) {
        return out;
      }
    }
  }

  return out;
}

/**
 * 读取当前页面正文快照。
 */
export function getCurrentPageSnapshot(): PageContentSnapshot {
  const roots = selectBestRoots();
  const sections = roots
    .map((root, index) => {
      const text = normalizeText(
        root instanceof HTMLElement ? root.innerText : root.textContent || "",
        MAX_PAGE_TEXT_CHARS,
      );
      if (!text) return "";
      if (index === 0) return text;
      const title = normalizeText(
        root.querySelector("h1, h2, h3")?.textContent || "",
        120,
      );
      return title ? `${title}\n${text}` : text;
    })
    .filter(Boolean);

  const fallbackBody = normalizeText(
    document.body instanceof HTMLElement ? document.body.innerText : "",
    MAX_PAGE_TEXT_CHARS,
  );
  const text = normalizeText(
    sections.join("\n\n"),
    MAX_PAGE_TEXT_CHARS,
  ) || fallbackBody;

  return {
    text,
    images: extractImagesFromRoots(roots),
  };
}

/**
 * 读取安全页面元信息。
 */
export function getSafePageMeta(): SafePageMeta {
  const fallbackUrl =
    normalizeText(window.location?.href, 1000) || "about:blank";
  const fallbackTitle = normalizeText(document.title, 200) || "未命名页面";
  const htmlLang = normalizeText(
    document.documentElement?.getAttribute("lang"),
    40,
  );
  const metaLang = normalizeText(
    document
      .querySelector('meta[http-equiv="content-language"]')
      ?.getAttribute("content"),
    40,
  );

  return {
    url: fallbackUrl,
    title: fallbackTitle,
    lang: htmlLang || metaLang || "zh-CN",
  };
}

/**
 * 判断当前目标是否为可编辑区域。
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = String(target.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "input") return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}
