/**
 * Console UI 登录卡片。
 *
 * 关键点（中文）
 * - 仅在控制面需要统一账户登录时显示。
 * - 保持最小输入结构，方便先打通 Bearer Token 链路。
 */

import * as React from "react"
import { Button } from "@downcity/ui"
import { Loader2Icon } from "lucide-react"

export interface AuthLoginCardProps {
  /**
   * 当前是否正在提交。
   */
  submitting: boolean

  /**
   * 当前错误文案。
   */
  errorMessage: string

  /**
   * 提交登录回调。
   */
  onSubmit: (input: { username: string; password: string }) => Promise<void>
}

export function AuthLoginCard(props: AuthLoginCardProps) {
  const { submitting, errorMessage, onSubmit } = props
  const [username, setUsername] = React.useState("admin")
  const [password, setPassword] = React.useState("")

  const handleSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({ username, password })
  }, [onSubmit, password, username])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-[22px] bg-background px-6 py-6 shadow-xl ring-1 ring-border/70">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-base font-medium text-foreground">登录</h1>
          <p className="mt-1 text-xs text-muted-foreground">Console UI</p>
        </div>

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
                登录中...
              </>
            ) : (
              "登录"
            )}
          </Button>
        </form>
      </section>
    </div>
  )
}
