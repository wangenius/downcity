/**
 * 通用配置字段渲染器。
 *
 * 关键点（中文）
 * - 统一渲染 string / secret / boolean / select 四类基础字段。
 * - 通过 schema 驱动表单，避免每个业务模块都手写一套分支 UI。
 * - 当前优先服务 Console UI 的配置弹窗，不依赖具体业务对象。
 */

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Button, Input, Label } from "@downcity/ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { UiConfigEditorField } from "@/types/ConfigEditor"

export interface ConfigFieldEditorProps {
  /**
   * 字段 schema。
   */
  field: UiConfigEditorField
  /**
   * 当前字段值。
   */
  value: string | boolean
  /**
   * 字段值变更回调。
   */
  onChange: (value: string | boolean) => void
}

function renderRequiredMark(field: UiConfigEditorField) {
  if (field.required !== true) return null
  return <span className="text-destructive">*</span>
}

export function ConfigFieldEditor(props: ConfigFieldEditorProps) {
  const { field, value, onChange } = props

  if (field.type === "select") {
    const options = Array.isArray(field.options) ? field.options : []
    const currentValue = String(value ?? "")
    const activeOption =
      options.find((item) => item.value === currentValue) || options[0] || null

    return (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          {field.label} {renderRequiredMark(field)}
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-between rounded-[12px] px-3"
                disabled={field.disabled === true}
              />
            }
          >
            <span>{activeOption?.label || field.placeholder || "请选择"}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[12rem]">
            {options.map((option) => (
              <DropdownMenuItem
                key={`${field.key}:${option.value}`}
                onClick={() => onChange(option.value)}
              >
                {currentValue === option.value ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {field.description ? (
          <div className="text-[11px] leading-5 text-muted-foreground">{field.description}</div>
        ) : null}
      </div>
    )
  }

  if (field.type === "boolean") {
    const checked = value === true
    return (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{field.label}</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`h-10 rounded-[12px] border px-3 text-sm font-medium transition ${
              checked
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground"
            }`}
            disabled={field.disabled === true}
            onClick={() => onChange(true)}
          >
            {field.trueLabel || "是"}
          </button>
          <button
            type="button"
            className={`h-10 rounded-[12px] border px-3 text-sm font-medium transition ${
              !checked
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground"
            }`}
            disabled={field.disabled === true}
            onClick={() => onChange(false)}
          >
            {field.falseLabel || "否"}
          </button>
        </div>
        {field.description ? (
          <div className="text-[11px] leading-5 text-muted-foreground">{field.description}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">
        {field.label} {renderRequiredMark(field)}
      </Label>
      <Input
        type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
        placeholder={field.placeholder}
        className="h-10 rounded-[12px]"
        value={String(value ?? "")}
        disabled={field.disabled === true}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? (
        <div className="text-[11px] leading-5 text-muted-foreground">{field.description}</div>
      ) : null}
    </div>
  )
}
