/**
 * Console UI 鉴权入口页。
 *
 * 关键点（中文）
 * - 未登录时不再覆盖 dashboard，而是直接进入独立入口页。
 * - 统一承载"鉴权检查中 / 初始化管理员 / 登录"三种状态，避免首屏闪烁与状态混淆。
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
   * 当前是否需要先初始化首个管理员。
   */
  bootstrapRequired: boolean

  /**
   * 当前是否正在提交登录表单。
   */
  submitting: boolean

  /**
   * 当前登录错误文案。
   */
  errorMessage: string

  /**
   * 提交登录回调。
   */
  onSubmit: (input: { username: string; password: string; displayName?: string }) => Promise<void>
}

export function AuthGatePage(props: AuthGatePageProps) {
  const { checking, bootstrapRequired, submitting, errorMessage, onSubmit } = props
  const [username, setUsername] = React.useState("admin")
  const [password, setPassword] = React.useState("")
  const [displayName, setDisplayName] = React.useState("Admin")

  const handleSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({
      username,
      password,
      ...(bootstrapRequired ? { displayName } : {}),
    })
  }, [bootstrapRequired, displayName, onSubmit, password, username])

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary/30 px-4">
      <section className="w-full max-w-sm rounded-[22px] bg-background px-6 py-6 shadow-[0_1px_0_rgba(17,17,19,0.03)] ring-1 ring-border/70">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-base font-medium text-foreground">
            {checking ? "检查中" : bootstrapRequired ? "初始化" : "登录"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {checking
              ? "验证访问权限..."
              : bootstrapRequired
                ? "创建管理员账户"
                : "Console UI"}
          </p>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>检查认证状态</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs text-muted-foreground">
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 w-full rounded-[11px] border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring"
                disabled={submitting}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs text-muted-foreground">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-[11px] border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring"
                disabled={submitting}
              />
            </div>

            {/* Display Name (bootstrap only) */}
            {bootstrapRequired && (
              <div className="space-y-1.5">
                <label htmlFor="displayName" className="text-xs text-muted-foreground">
                  显示名称
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-9 w-full rounded-[11px] border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring"
                  disabled={submitting}
                />
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
              disabled={submitting || !username.trim() || !password.trim()}
            >
              {submitting ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  {bootstrapRequired ? "初始化中..." : "登录中..."}
                </>
              ) : bootstrapRequired ? (
                "初始化"
              ) : (
                "登录"
              )}
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}
