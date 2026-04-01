/**
 * Console UI 登录卡片。
 *
 * 关键点（中文）
 * - 仅在控制面需要统一账户登录时显示。
 * - 保持最小输入结构，方便先打通 Bearer Token 链路。
 */

import * as React from "react"
import { Button } from "@downcity/ui"

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
    await onSubmit({
      username,
      password,
    })
  }, [onSubmit, password, username])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[28px] border border-white/10 bg-zinc-950/95 p-6 text-white shadow-2xl"
      >
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Unified Auth</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">登录 Console UI</h2>
          <p className="text-sm leading-6 text-zinc-400">
            当前控制面已启用统一账户。继续使用前，需要先完成登录。
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-white/30"
              autoFocus
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-white/30"
            />
          </label>

        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "登录中..." : "登录"}
          </Button>
        </div>
      </form>
    </div>
  )
}
