/**
 * 页面选中文本引用浮层。
 *
 * 关键点（中文）：
 * - 浮层运行在网页 content script 中，位置跟随真实选区。
 * - 点击「引用」后把选中文本发给 background，再由 Side Panel 插入 editor node。
 * - 不读取或保存页面业务状态，只传递用户主动选择的文本。
 */

const OVERLAY_ID = "downcity-selection-reference-overlay";
const MAX_SELECTION_LENGTH = 5000;

let overlayElement: HTMLButtonElement | null = null;
let latestText = "";

function normalizeSelectionText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_SELECTION_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SELECTION_LENGTH - 3)}...`;
}

function getSelectionPayload(): {
  text: string;
  rect: DOMRect | null;
} {
  const selection = window.getSelection();
  const text = normalizeSelectionText(selection?.toString() || "");
  if (!selection || selection.rangeCount < 1 || !text) {
    return { text: "", rect: null };
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return { text: "", rect: null };
  }
  return { text, rect };
}

function ensureOverlay(): HTMLButtonElement {
  if (overlayElement) return overlayElement;

  const button = document.createElement("button");
  button.id = OVERLAY_ID;
  button.type = "button";
  button.textContent = "引用";
  button.style.position = "fixed";
  button.style.zIndex = "2147483647";
  button.style.display = "none";
  button.style.alignItems = "center";
  button.style.height = "28px";
  button.style.padding = "0 10px";
  button.style.border = "0";
  button.style.borderRadius = "999px";
  button.style.background = "#111113";
  button.style.color = "#fcfcfd";
  button.style.font = "500 12px/28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  button.style.boxShadow = "0 8px 24px rgba(17,17,19,0.18)";
  button.style.cursor = "pointer";
  button.style.userSelect = "none";
  button.style.webkitUserSelect = "none";

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", () => {
    const text = latestText || getSelectionPayload().text;
    if (!text) return;
    chrome.runtime.sendMessage({
      type: "downcity.page-selection.reference",
      id: `selection-${Date.now()}`,
      text,
      pageTitle: document.title || "",
      pageUrl: window.location.href,
    });
    hideOverlay();
  });

  document.documentElement.appendChild(button);
  overlayElement = button;
  return button;
}

function hideOverlay() {
  latestText = "";
  if (overlayElement) {
    overlayElement.style.display = "none";
  }
}

function showOverlay() {
  const payload = getSelectionPayload();
  if (!payload.text || !payload.rect) {
    hideOverlay();
    return;
  }

  latestText = payload.text;
  const button = ensureOverlay();
  button.style.display = "inline-flex";

  const margin = 8;
  const left = Math.min(
    window.innerWidth - button.offsetWidth - margin,
    Math.max(margin, payload.rect.left + payload.rect.width / 2 - button.offsetWidth / 2),
  );
  const top =
    payload.rect.top > 40
      ? payload.rect.top - button.offsetHeight - margin
      : payload.rect.bottom + margin;

  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(Math.max(margin, top))}px`;
}

function scheduleOverlayUpdate() {
  window.setTimeout(showOverlay, 0);
}

document.addEventListener("selectionchange", scheduleOverlayUpdate);
document.addEventListener("mouseup", scheduleOverlayUpdate);
document.addEventListener("keyup", scheduleOverlayUpdate);
document.addEventListener("scroll", hideOverlay, true);
window.addEventListener("resize", hideOverlay);
