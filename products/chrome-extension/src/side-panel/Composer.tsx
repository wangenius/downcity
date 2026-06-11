/**
 * Side Panel 富文本输入框。
 *
 * 关键点（中文）：
 * - 使用 contenteditable 承载普通文本与 inline reference node。
 * - 当前 tab 引用会自动同步到输入框，用户可删除。
 * - 页面选中文本由 content script 浮层传入，并插入为 editor node。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ActiveTabContext } from "../types/extension";
import type {
  CloseSidePanelMessage,
  ComposerReference,
  ComposerSubmitPayload,
  FocusComposerMessage,
  SelectionReferenceMessage,
  SidePanelReadyResponse,
} from "../types/sidePanel";

/**
 * Composer 属性。
 */
export interface ComposerProps {
  /**
   * 当前活动标签页。
   */
  tab: ActiveTabContext;
  /**
   * 是否禁用输入。
   */
  disabled?: boolean;
  /**
   * 是否正在发送。
   */
  sending?: boolean;
  /**
   * 提交回调。
   */
  onSubmit: (payload: ComposerSubmitPayload) => void;
}

function shortenReferenceLabel(input: string): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return "当前页面";
  if (text.length <= 56) return text;
  return `${text.slice(0, 53)}...`;
}

function pageReferenceFromTab(tab: ActiveTabContext): ComposerReference {
  let label = String(tab.title || "").trim();
  if (tab.url) {
    try {
      const parsed = new URL(tab.url);
      label = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch {
      label = tab.url;
    }
  }
  return {
    id: "current-page",
    type: "page",
    label: shortenReferenceLabel(label),
    url: tab.url,
    text: tab.title,
  };
}

function readPlainText(element: HTMLElement | null): string {
  if (!element) return "";
  const parts: string[] = [];

  const visit = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.composerReference === "true") return;
    if (node.tagName === "BR") {
      parts.push("\n");
      return;
    }
    node.childNodes.forEach(visit);
    if (node.tagName === "DIV" || node.tagName === "P") {
      parts.push("\n");
    }
  };

  element.childNodes.forEach(visit);
  return parts
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readReferenceNode(node: HTMLElement): ComposerReference | null {
  const type = node.dataset.referenceType;
  if (type !== "page" && type !== "selection") return null;
  const id = node.dataset.referenceId || "";
  const label = node.dataset.referenceLabel || "";
  if (!id || !label) return null;
  return {
    id,
    type,
    label,
    url: node.dataset.referenceUrl || undefined,
    text: node.dataset.referenceText || undefined,
  };
}

function readReferences(element: HTMLElement | null): ComposerReference[] {
  if (!element) return [];
  const references: ComposerReference[] = [];
  const nodes = Array.from(
    element.querySelectorAll<HTMLElement>('[data-composer-reference="true"]'),
  );
  nodes.forEach((node) => {
    const reference = readReferenceNode(node);
    if (reference) references.push(reference);
  });
  return references;
}

function createReferenceNode(reference: ComposerReference): HTMLSpanElement {
  const node = document.createElement("span");
  node.contentEditable = "false";
  node.dataset.composerReference = "true";
  node.dataset.referenceId = reference.id;
  node.dataset.referenceType = reference.type;
  node.dataset.referenceLabel = reference.label;
  if (reference.url) node.dataset.referenceUrl = reference.url;
  if (reference.text) node.dataset.referenceText = reference.text;
  node.title = reference.url || reference.text || reference.label;
  node.className =
    "group/reference relative mx-0.5 inline-flex h-7 max-w-[min(14rem,calc(100%-0.5rem))] min-w-0 items-center gap-1.5 overflow-hidden rounded-lg bg-foreground/[0.09] px-1.5 align-baseline text-[11px] leading-none text-foreground/90 shadow-none transition-colors hover:bg-foreground/[0.12]";

  const icon = document.createElement("span");
  icon.className =
    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-muted-foreground/75 transition-opacity group-hover/reference:opacity-0";
  icon.textContent = reference.type === "page" ? "⌘" : "“";
  node.appendChild(icon);

  const label = document.createElement("span");
  label.className = "min-w-0 truncate font-medium";
  label.textContent = reference.label;
  node.appendChild(label);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.referenceRemove = "true";
  button.className =
    "absolute left-1 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/reference:opacity-100";
  button.setAttribute("aria-label", "删除引用");
  button.title = "删除引用";
  button.textContent = "×";
  node.appendChild(button);

  return node;
}

function updateEditorState(
  element: HTMLElement | null,
  setHasText: (value: boolean) => void,
  setHasReferences: (value: boolean) => void,
) {
  setHasText(Boolean(readPlainText(element)));
  setHasReferences(readReferences(element).length > 0);
}

function removeReferenceNodes(
  element: HTMLElement,
  matcher: (reference: ComposerReference) => boolean,
) {
  const nodes = Array.from(
    element.querySelectorAll<HTMLElement>('[data-composer-reference="true"]'),
  );
  nodes.forEach((node) => {
    const reference = readReferenceNode(node);
    if (reference && matcher(reference)) {
      node.remove();
    }
  });
}

function insertReferenceAtStart(element: HTMLElement, reference: ComposerReference) {
  const node = createReferenceNode(reference);
  const space = document.createTextNode(" ");
  const firstChild = element.firstChild;
  element.insertBefore(space, firstChild);
  element.insertBefore(node, space);
}

function isSelectionInside(element: HTMLElement): boolean {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  return Boolean(node && element.contains(node));
}

function insertReferenceAtCursor(element: HTMLElement, reference: ComposerReference) {
  const node = createReferenceNode(reference);
  const space = document.createTextNode(" ");
  const selection = window.getSelection();
  if (!selection || selection.rangeCount < 1 || !isSelectionInside(element)) {
    element.appendChild(node);
    element.appendChild(space);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  range.insertNode(space);
  range.setStartAfter(space);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function clearEditorKeepingPageReferences(element: HTMLElement) {
  const pageReferences = readReferences(element).filter((item) => item.type === "page");
  element.innerHTML = "";
  pageReferences.forEach((reference) => {
    insertReferenceAtStart(element, reference);
  });
}

/**
 * Side Panel 富文本输入框。
 */
export function Composer(props: ComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const insertedSelectionIdsRef = useRef<Set<string>>(new Set());
  const pendingFocusRef = useRef(false);
  const { disabled, onSubmit, sending, tab } = props;
  const [hasText, setHasText] = useState(false);
  const [hasReferences, setHasReferences] = useState(false);

  const pageReference = useMemo(() => pageReferenceFromTab(tab), [tab]);
  const canSubmit = !disabled && !sending && (hasText || hasReferences);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    removeReferenceNodes(editor, (reference) => reference.type === "page");
    insertReferenceAtStart(editor, pageReference);
    updateEditorState(editor, setHasText, setHasReferences);
  }, [pageReference]);

  const syncTextState = useCallback(() => {
    updateEditorState(editorRef.current, setHasText, setHasReferences);
  }, []);

  const closeSidePanel = useCallback(() => {
    const message: CloseSidePanelMessage = {
      type: "downcity.side-panel.close",
    };
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
    window.close();
  }, []);

  const focusEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || disabled) {
      pendingFocusRef.current = true;
      return;
    }

    pendingFocusRef.current = false;
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [disabled]);

  useEffect(() => {
    if (!disabled && pendingFocusRef.current) {
      focusEditor();
    }
  }, [disabled, focusEditor]);

  const insertSelectionReference = useCallback((message: SelectionReferenceMessage) => {
    const text = String(message.text || "").trim();
    if (!text) return;
    const id = String(message.id || `selection-${Date.now()}`).trim();
    if (insertedSelectionIdsRef.current.has(id)) return;
    insertedSelectionIdsRef.current.add(id);
    const editor = editorRef.current;
    if (editor) {
      insertReferenceAtCursor(editor, {
        id,
        type: "selection",
        label: `选中文本：${shortenReferenceLabel(text)}`,
        url: message.pageUrl,
        text,
      });
      updateEditorState(editor, setHasText, setHasReferences);
    }
    focusEditor();
  }, [focusEditor]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      const record = message as Partial<SelectionReferenceMessage | FocusComposerMessage> | null;
      if (record?.type === "downcity.side-panel.focus-composer") {
        focusEditor();
        return;
      }
      if (record?.type !== "downcity.side-panel.insert-selection-reference") {
        return;
      }
      insertSelectionReference(record as SelectionReferenceMessage);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.runtime.sendMessage({ type: "downcity.side-panel.ready" }, (response) => {
      const readyResponse = response as SidePanelReadyResponse | undefined;
      const reference = readyResponse?.reference || undefined;
      if (reference?.type === "downcity.side-panel.insert-selection-reference") {
        insertSelectionReference(reference);
      }
      if (readyResponse?.focusComposer) {
        focusEditor();
      }
      void chrome.runtime.lastError;
    });

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [focusEditor, insertSelectionReference]);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    const editor = editorRef.current;
    const text = readPlainText(editor);
    const references = readReferences(editor);
    onSubmit({ text, references });
    if (editor) {
      clearEditorKeepingPageReferences(editor);
    }
    updateEditorState(editor, setHasText, setHasReferences);
  }, [canSubmit, onSubmit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSidePanel();
        return;
      }
      if (event.key.toLowerCase() === "i" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        focusEditor();
        return;
      }
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      submit();
    },
    [closeSidePanel, focusEditor, submit],
  );

  const handleEditorClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeButton = target.closest<HTMLElement>('[data-reference-remove="true"]');
    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      removeButton.closest<HTMLElement>('[data-composer-reference="true"]')?.remove();
      syncTextState();
      editorRef.current?.focus();
      return;
    }
  }, [syncTextState]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    document.execCommand("insertText", false, text);
    syncTextState();
  }, [syncTextState]);

  return (
    <div className="relative min-w-0 max-w-full overflow-hidden">
      <div className="min-w-0 max-w-full overflow-hidden rounded-[18px] bg-foreground/[0.035] px-2.5 py-2 shadow-none transition-colors focus-within:bg-foreground/[0.055]">
        <div
          ref={editorRef}
          className="max-h-[200px] min-h-[54px] min-w-0 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-[14px] px-1 py-1 text-[13px] leading-[1.34] text-foreground outline-none [overflow-wrap:anywhere] empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)]"
          contentEditable={!disabled}
          data-placeholder="Ask anything..."
          onClick={handleEditorClick}
          onInput={syncTextState}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
          suppressContentEditableWarning
        />

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[17px] font-medium leading-none text-primary-foreground shadow-none transition hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-35"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="发送"
            title="发送"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
