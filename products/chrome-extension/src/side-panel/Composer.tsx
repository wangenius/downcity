/**
 * Side Panel 富文本输入框。
 *
 * 关键点（中文）：
 * - 使用 contenteditable 承载普通文本与 inline reference node。
 * - 当前 tab 引用会自动同步到输入框，用户可删除。
 * - 页面选中文本通过 hover pop item 插入为引用。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ActiveTabContext } from "../types/extension";
import type { ComposerReference, ComposerSubmitPayload } from "../types/sidePanel";
import {
  getActiveTabSelectionContext,
  type ActiveTabSelectionContext,
} from "../services/tab";

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
  return String(element?.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Side Panel 富文本输入框。
 */
export function Composer(props: ComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const { disabled, onSubmit, sending, tab } = props;
  const [references, setReferences] = useState<ComposerReference[]>([]);
  const [selection, setSelection] = useState<ActiveTabSelectionContext>({
    tabId: null,
    text: "",
  });
  const [hasText, setHasText] = useState(false);

  const pageReference = useMemo(() => pageReferenceFromTab(tab), [tab]);
  const canSubmit = !disabled && !sending && (hasText || references.length > 0);

  useEffect(() => {
    setReferences((prev) => {
      const withoutPage = prev.filter((item) => item.type !== "page");
      return [pageReference, ...withoutPage];
    });
  }, [pageReference]);

  const syncTextState = useCallback(() => {
    setHasText(Boolean(readPlainText(editorRef.current)));
  }, []);

  const refreshSelection = useCallback(async () => {
    try {
      const nextSelection = await getActiveTabSelectionContext();
      setSelection(nextSelection);
    } catch {
      setSelection({ tabId: null, text: "" });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshSelection();
    }, 900);
    void refreshSelection();
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshSelection]);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const insertSelectionReference = useCallback(() => {
    const text = String(selection.text || "").trim();
    if (!text) return;
    const id = `selection-${Date.now()}`;
    setReferences((prev) => [
      ...prev,
      {
        id,
        type: "selection",
        label: `选中文本：${shortenReferenceLabel(text)}`,
        text,
      },
    ]);
    setSelection({ tabId: null, text: "" });
    editorRef.current?.focus();
  }, [selection.text]);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    const text = readPlainText(editorRef.current);
    onSubmit({ text, references });
    if (editorRef.current) {
      editorRef.current.innerText = "";
    }
    setReferences((prev) => prev.filter((item) => item.type === "page"));
    setHasText(false);
  }, [canSubmit, onSubmit, references]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <div className="relative">
      {selection.text ? (
        <button
          type="button"
          className="absolute -top-10 left-3 z-10 max-w-[calc(100%-24px)] truncate rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-foreground shadow-[0_6px_20px_rgba(17,17,19,0.12)]"
          onClick={insertSelectionReference}
          title={selection.text}
        >
          引用选中
        </button>
      ) : null}

      <div className="rounded-[22px] bg-muted px-3 py-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)] transition focus-within:shadow-[inset_0_0_0_1px_var(--color-ring)]">
        <div
          className="flex min-h-[92px] w-full flex-wrap content-start items-start gap-1.5 rounded-[16px] text-[14px] leading-6 text-foreground"
          onClick={() => editorRef.current?.focus()}
        >
          {references.map((item) => (
            <span
              key={item.id}
              contentEditable={false}
              className="inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-background px-2 text-[11px] leading-none text-foreground shadow-[0_0_0_1px_var(--color-border)]"
              title={item.url || item.text || item.label}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4f7cff]" />
              <span className="max-w-[190px] truncate">{item.label}</span>
              <button
                type="button"
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  removeReference(item.id);
                }}
                aria-label="删除引用"
                title="删除引用"
              >
                ×
              </button>
            </span>
          ))}
          <div
            ref={editorRef}
            className="min-w-[120px] flex-1 whitespace-pre-wrap break-words bg-transparent outline-none empty:before:text-muted-foreground/70 empty:before:content-[attr(data-placeholder)]"
            contentEditable={!disabled}
            data-placeholder="Ask anything..."
            onInput={syncTextState}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              void refreshSelection();
            }}
            role="textbox"
            aria-multiline="true"
            suppressContentEditableWarning
          />
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[17px] font-medium leading-none text-primary-foreground transition hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-45"
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
