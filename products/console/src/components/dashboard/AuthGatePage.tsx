/**
 * Console UI 鉴权入口页。
 *
 * 关键点（中文）
 * - 未登录时不再覆盖 dashboard，而是直接进入独立入口页。
 * - 统一承载"鉴权检查中 / 本机初始化提示 / Token 输入"三种状态，避免首屏闪烁与状态混淆。
 */

import * as React from "react"
import { Button } from "@downcity/ui"
import { Loader2Icon } from "lucide-react"

export interface AuthGatePageProps {
  /**
   * 当前是否仍在进行鉴权状态探测。
   */
  checking: boolean

  /**
   * 当前是否需要先在本机 CLI 创建首个 token。
   */
  bootstrapRequired: boolean

  /**
   * 当前是否正在提交 token 表单。
   */
  submitting: boolean

  /**
   * 当前 token 错误文案。
   */
  errorMessage: string

  /**
   * 提交 token 回调。
   */
  onSubmit: (input: { token: string }) => Promise<void>
}

export function AuthGatePage(props: AuthGatePageProps) {
  const { checking, bootstrapRequired, submitting, errorMessage, onSubmit } = props
  const [token, setToken] = React.useState("")

  const handleSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({ token })
  }, [onSubmit, token])

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary/30 px-4">
      <section className="w-full max-w-sm rounded-[22px] bg-background px-6 py-6 shadow-[0_1px_0_rgba(17,17,19,0.03)] ring-1 ring-border/70">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-base font-medium text-foreground">
            {checking ? "检查中" : bootstrapRequired ? "先创建 Token" : "输入 Token"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {checking
              ? "验证访问权限..."
              : bootstrapRequired
                ? "请先在本机终端执行 city token create"
                : "Console UI Bearer Token"}
          </p>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>检查认证状态</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="token" className="text-xs text-muted-foreground">
                Bearer Token
              </label>
              <textarea
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="min-h-[108px] w-full rounded-[11px] border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
                disabled={submitting}
                placeholder="支持直接粘贴 Bearer xxx 或纯 token"
              />
              <div className="rounded-[11px] bg-secondary/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                如何获取：在当前机器的终端执行 `city token create my-token`，或直接运行 `city token`。
              </div>
            </div>

            {bootstrapRequired && (
              <div className="rounded-[11px] bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
                先在当前机器的终端执行 `city token create my-token`，拿到 token 后再粘贴到这里。
              </div>
            )}

            {/* Error */}
            {errorMessage && (
              <div className="rounded-[11px] bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errorMessage}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !token.trim()}
            >
              {submitting ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : (
                "进入 Console"
              )}
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}
