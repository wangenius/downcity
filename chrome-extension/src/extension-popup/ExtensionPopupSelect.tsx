/**
 * Extension Popup 自定义下拉选择器。
 *
 * 关键点（中文）：
 * - 使用轻量受控弹层替代浏览器原生 select，保证扩展弹窗风格一致。
 * - 统一支持主文案、辅助说明与禁用态，适配 Agent / Chat / Ask 历史三类场景。
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";

export interface ExtensionPopupSelectProps {
  /**
   * 字段标签。
   */
  label: string;

  /**
   * 当前选中值。
   */
  value: string;

  /**
   * 占位文案。
   */
  placeholder: string;

  /**
   * 可选项列表。
   */
  options: ExtensionSelectOption[];

  /**
   * 值变化回调。
   */
  onChange: (value: string) => void;

  /**
   * 是否禁用。
   */
  disabled?: boolean;
}

export function ExtensionPopupSelect(props: ExtensionPopupSelectProps) {
  const fieldId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => props.options.find((item) => item.value === props.value) || null,
    [props.options, props.value],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (props.disabled) {
      setOpen(false);
    }
  }, [props.disabled]);

  return (
    <label
      htmlFor={fieldId}
      className="flex min-w-0 flex-col gap-1 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
    >
      {props.label}
      <div ref={rootRef} className="relative min-w-0">
        <button
          id={fieldId}
          type="button"
          className="flex min-h-[38px] w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-border bg-muted px-3 py-2 text-left text-[12px] normal-case tracking-normal text-foreground outline-none transition focus:border-border-strong focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            if (props.disabled) return;
            setOpen((prev) => !prev);
          }}
          disabled={props.disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 flex-1">
            {selectedOption ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {selectedOption.label}
                </span>
                {selectedOption.description ? (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {selectedOption.description}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="truncate text-[12px] text-muted-foreground">
                {props.placeholder}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {open ? "▴" : "▾"}
          </span>
        </button>

        {open ? (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-w-full overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <div role="listbox" className="max-h-56 overflow-auto py-1">
              {props.options.length > 0 ? (
                props.options.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="flex w-full min-w-0 items-start justify-between gap-2 px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      props.onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12px] font-medium normal-case tracking-normal text-foreground"
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      {item.description ? (
                        <span
                          className="mt-0.5 block truncate text-[10px] normal-case tracking-normal text-muted-foreground"
                          title={item.description}
                        >
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    {props.value === item.value ? (
                      <span className="shrink-0 pt-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-[11px] normal-case tracking-normal text-muted-foreground">
                  {props.placeholder}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}
