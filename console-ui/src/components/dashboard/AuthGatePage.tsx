/**
 * Console UI 鉴权入口页。
 *
 * 关键点（中文）
 * - 未登录时不再覆盖 dashboard，而是直接进入独立入口页。
 * - 统一承载“鉴权检查中 / 初始化管理员 / 登录”三种状态，避免首屏闪烁与状态混淆。
 */

import * as React from "react"
import { Button } from "@downcity/ui"

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
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f2ea_0%,_#ece5d7_52%,_#ded6c6_100%)] text-zinc-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
        <section className="relative overflow-hidden rounded-[32px] border border-black/10 bg-[linear-gradient(160deg,_rgba(255,255,255,0.72)_0%,_rgba(245,239,227,0.92)_100%)] p-6 shadow-[0_24px_80px_rgba(32,24,8,0.12)] lg:p-10">
          <div className="absolute inset-y-0 left-0 w-px bg-[linear-gradient(180deg,_transparent_0%,_rgba(24,24,27,0.18)_24%,_rgba(24,24,27,0.18)_76%,_transparent_100%)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,_transparent_0%,_rgba(24,24,27,0.18)_18%,_rgba(24,24,27,0.18)_82%,_transparent_100%)]" />

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.28em] text-zinc-500">
            <span className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1.5">
              Downcity Control Plane
            </span>
            <span className="rounded-full border border-amber-950/10 bg-amber-950/[0.05] px-3 py-1.5 text-amber-950/80">
              Unified Access
            </span>
          </div>

          <div className="mt-10 max-w-2xl space-y-6">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.24em] text-zinc-500">Console UI</p>
              <h1 className="max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.06em] text-zinc-950 md:text-6xl">
                在进入控制面之前，先确认操作者身份。
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-600 md:text-lg">
                这个入口页只处理控制面的访问边界。登录成功后，Console UI 才会加载 agent、channel、task
                和写操作入口。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[24px] border border-black/10 bg-white/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Boundary</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">
                  未登录时不渲染 dashboard，避免把半初始化状态暴露给操作者。
                </p>
              </div>
              <div className="rounded-[24px] border border-black/10 bg-white/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Identity</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">
                  登录成功后，后续请求统一复用 Bearer Token，并在顶部显示当前用户名。
                </p>
              </div>
              <div className="rounded-[24px] border border-black/10 bg-white/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Protection</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">
                  写入类操作会落到统一权限矩阵，不再允许匿名入口直接进入控制面。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex">
          <div className="flex w-full flex-col justify-between rounded-[32px] border border-zinc-950/10 bg-zinc-950 px-6 py-6 text-zinc-50 shadow-[0_24px_80px_rgba(16,10,0,0.18)] lg:px-8 lg:py-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Access State</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    {checking ? "检查控制面状态" : bootstrapRequired ? "初始化管理员" : "登录 Console UI"}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                  {checking ? "Preflight" : bootstrapRequired ? "Bootstrap Admin" : "Login Required"}
                </div>
              </div>

              {checking ? (
                <div className="space-y-5 py-6">
                  <p className="max-w-sm text-sm leading-7 text-zinc-400">
                    正在检查当前 console 是否已经启用统一账户，以及本地是否存在可复用的 Bearer Token。
                  </p>
                  <div className="space-y-3">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-200/80" />
                    </div>
                    <div className="grid gap-2 text-sm text-zinc-500">
                      <p>1. 读取本地登录态</p>
                      <p>2. 查询 `/api/auth/status`</p>
                      <p>3. 决定进入 dashboard 还是登录入口</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 py-4">
                  <p className="text-sm leading-7 text-zinc-400">
                    {bootstrapRequired
                      ? "当前控制面还没有任何统一账户用户。先初始化首个管理员，完成后会直接进入完整 dashboard 页面。"
                      : "当前控制面已经启用统一账户。登录成功后，会直接进入完整 dashboard 页面。"}
                  </p>

                  <label className="block space-y-1.5">
                    <span className="text-sm text-zinc-300">用户名</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-200/40"
                      autoFocus
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm text-zinc-300">密码</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-200/40"
                    />
                  </label>

                  {bootstrapRequired ? (
                    <label className="block space-y-1.5">
                      <span className="text-sm text-zinc-300">显示名称</span>
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className="w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-200/40"
                      />
                    </label>
                  ) : null}

                  {errorMessage ? (
                    <div className="rounded-[18px] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {errorMessage}
                    </div>
                  ) : null}

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting
                        ? (bootstrapRequired ? "初始化中..." : "登录中...")
                        : (bootstrapRequired ? "初始化并进入 Console UI" : "进入 Console UI")}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <div className="border-t border-white/10 pt-4 text-xs leading-6 text-zinc-500">
              登录页是独立入口，不会在后台继续渲染 agent 列表、任务面板或调试区。
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
