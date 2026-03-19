/**
 * 全局确认弹窗提供器。
 *
 * 关键点（中文）
 * - 统一替代 `window.confirm`，保证交互样式与主题一致。
 * - 通过 `useConfirmDialog()` 提供 Promise 风格 API，便于在业务代码里直接 `await`。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ConfirmDialogOptions = {
  /**
   * 标题（必填）。
   */
  title: string
  /**
   * 说明文案（可选）。
   */
  description?: string
  /**
   * 确认按钮文案。
   */
  confirmText?: string
  /**
   * 取消按钮文案。
   */
  cancelText?: string
  /**
   * 确认按钮语义样式。
   */
  confirmVariant?: "default" | "destructive"
}

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

type ActiveConfirmState = {
  /**
   * 当前弹窗配置。
   */
  options: ConfirmDialogOptions
  /**
   * 当前 Promise 结果回调。
   */
  resolve: (result: boolean) => void
}

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(
  null,
)

const DEFAULT_OPTIONS: Required<
  Pick<ConfirmDialogOptions, "confirmText" | "cancelText" | "confirmVariant">
> = {
  confirmText: "确认",
  cancelText: "取消",
  confirmVariant: "default",
}

export function ConfirmDialogProvider(props: { children: React.ReactNode }) {
  const { children } = props
  const [active, setActive] = React.useState<ActiveConfirmState | null>(null)

  const closeWithResult = React.useCallback((result: boolean) => {
    setActive((prev) => {
      if (!prev) return prev
      prev.resolve(result)
      return null
    })
  }, [])

  React.useEffect(() => {
    return () => {
      // 关键点（中文）：Provider 卸载时兜底结束等待中的确认请求，避免 Promise 悬挂。
      setActive((prev) => {
        if (prev) prev.resolve(false)
        return null
      })
    }
  }, [])

  const confirm = React.useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    const normalizedTitle = String(options.title || "").trim()
    const normalizedOptions: ConfirmDialogOptions = {
      ...options,
      title: normalizedTitle || "请确认操作",
      confirmText: String(options.confirmText || "").trim() || DEFAULT_OPTIONS.confirmText,
      cancelText: String(options.cancelText || "").trim() || DEFAULT_OPTIONS.cancelText,
      confirmVariant: options.confirmVariant || DEFAULT_OPTIONS.confirmVariant,
    }

    return new Promise<boolean>((resolve) => {
      setActive((prev) => {
        if (prev) {
          // 关键点（中文）：新请求覆盖旧请求时，旧请求按取消处理，避免并发冲突。
          prev.resolve(false)
        }
        return {
          options: normalizedOptions,
          resolve,
        }
      })
    })
  }, [])

  const contextValue = React.useMemo<ConfirmDialogContextValue>(
    () => ({ confirm }),
    [confirm],
  )

  const options = active?.options
  const open = Boolean(active)
  const confirmText = String(options?.confirmText || DEFAULT_OPTIONS.confirmText)
  const cancelText = String(options?.cancelText || DEFAULT_OPTIONS.cancelText)
  const confirmVariant = options?.confirmVariant || DEFAULT_OPTIONS.confirmVariant
  const description = String(options?.description || "").trim()

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeWithResult(false)
          }
        }}
      >
        <DialogContent showCloseButton={false} className="w-[min(92vw,30rem)] p-0">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle>{options?.title || "请确认操作"}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closeWithResult(false)
              }}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={confirmVariant}
              onClick={() => {
                closeWithResult(true)
              }}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog(): ConfirmDialogContextValue["confirm"] {
  const context = React.useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error("useConfirmDialog must be used within <ConfirmDialogProvider>.")
  }
  return context.confirm
}

