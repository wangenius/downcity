/**
 * Global Access 管理页。
 *
 * 关键点（中文）
 * - 当前只保留单管理员模型：当前 admin 摘要、密码更新、token 管理。
 * - 去掉多用户目录与角色编排，避免控制面承载不必要的复杂度。
 */

import * as React from "react"
import { KeyRoundIcon, Loader2Icon, RefreshCcwIcon } from "lucide-react"
import { Button, Input, Label } from "@downcity/ui"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import type {
  UiAuthAccessIssuedToken,
  UiAuthAccessTokenSummary,
  UiAuthAccessUser,
} from "@/types/AuthAccess"

function isRevoked(token: UiAuthAccessTokenSummary): boolean {
  return Boolean(String(token.revokedAt || "").trim())
}

function SummaryChip(props: {
  label: string
  value: string
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
      <span className="uppercase tracking-[0.14em]">{props.label}</span>
      <span className="font-medium text-foreground">{props.value}</span>
    </span>
  )
}

export interface AccessSectionProps {
  /**
   * 当前管理员摘要。
   */
  user: UiAuthAccessUser | null

  /**
   * 当前管理员 token 列表。
   */
  tokens: UiAuthAccessTokenSummary[]

  /**
   * 当前是否正在刷新页面数据。
   */
  loading: boolean

  /**
   * 最近一次新签发的明文 token。
   */
  latestIssuedToken: UiAuthAccessIssuedToken | null

  /**
   * 时间格式化器。
   */
  formatTime: (value?: string | number | null) => string

  /**
   * 刷新 Access 数据。
   */
  onRefresh: () => Promise<void>

  /**
   * 修改当前管理员密码。
   */
  onUpdatePassword: (input: {
    currentPassword: string
    nextPassword: string
  }) => Promise<void>

  /**
   * 签发新 token。
   */
  onCreateToken: (input: {
    name: string
    expiresAt?: string
  }) => Promise<void>

  /**
   * 吊销 token。
   */
  onRevokeToken: (input: {
    tokenId: string
  }) => Promise<void>

  /**
   * 清理最近一次签发的明文 token。
   */
  onClearLatestIssuedToken: () => void
}

export function AccessSection(props: AccessSectionProps) {
  const {
    user,
    tokens,
    loading,
    latestIssuedToken,
    formatTime,
    onRefresh,
    onUpdatePassword,
    onCreateToken,
    onRevokeToken,
    onClearLatestIssuedToken,
  } = props
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [nextPassword, setNextPassword] = React.useState("")
  const [savingPassword, setSavingPassword] = React.useState(false)
  const [issuingToken, setIssuingToken] = React.useState(false)
  const [busyTokenId, setBusyTokenId] = React.useState("")
  const [tokenName, setTokenName] = React.useState("chrome-extension")
  const [tokenExpiresAt, setTokenExpiresAt] = React.useState("")

  const activeTokenCount = React.useMemo(
    () => tokens.filter((item) => !isRevoked(item)).length,
    [tokens],
  )

  const handleUpdatePassword = React.useCallback(async () => {
    try {
      setSavingPassword(true)
      await onUpdatePassword({
        currentPassword,
        nextPassword,
      })
      setCurrentPassword("")
      setNextPassword("")
    } finally {
      setSavingPassword(false)
    }
  }, [currentPassword, nextPassword, onUpdatePassword])

  const handleCreateToken = React.useCallback(async () => {
    try {
      setIssuingToken(true)
      await onCreateToken({
        name: tokenName,
        expiresAt: tokenExpiresAt || undefined,
      })
    } finally {
      setIssuingToken(false)
    }
  }, [onCreateToken, tokenExpiresAt, tokenName])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Global / Access
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Admin 与 Token 管理</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            控制面现在只维护一个管理员账户。这里仅处理两件事：修改管理员密码，以及管理 Bearer token。
          </p>
        </div>

        <Button variant="outline" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <RefreshCcwIcon className="mr-2 size-4" />}
          刷新
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip label="admin" value={String(user?.username || "-")} />
        <SummaryChip label="roles" value={(user?.roles || []).join(", ") || "-"} />
        <SummaryChip label="tokens" value={String(tokens.length)} />
        <SummaryChip label="active" value={String(activeTokenCount)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <DashboardModule
          title="Admin"
          description="仅当前管理员支持用户名密码登录。其他接入方统一使用 token。"
        >
          <div className="space-y-2 border-b border-border/70 pb-3">
            <div className="text-sm font-medium text-foreground">{user?.displayName || user?.username || "未登录"}</div>
            <div className="text-sm text-muted-foreground">用户名：{user?.username || "-"}</div>
            <div className="text-sm text-muted-foreground">权限：{(user?.permissions || []).join(", ") || "-"}</div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>当前密码</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>新密码</Label>
              <Input
                type="password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
            </div>
            <Button
              disabled={!user || savingPassword || !currentPassword.trim() || !nextPassword.trim()}
              onClick={() => void handleUpdatePassword()}
            >
              {savingPassword ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
              更新密码
            </Button>
          </div>
        </DashboardModule>

        <DashboardModule
          title="Tokens"
          description="token 可用于扩展、脚本或其他接入方直接访问 API。"
        >
          {latestIssuedToken ? (
            <div className="space-y-2 border-b border-border/70 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">新 token 已签发</p>
                  <p className="text-xs text-muted-foreground">明文只会返回这一次。</p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClearLatestIssuedToken}>
                  关闭
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-[14px] bg-secondary/80 px-3 py-2.5 text-xs text-foreground">
                {latestIssuedToken.token}
              </pre>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1.5">
              <Label>Token 名称</Label>
              <Input value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <Label>过期时间</Label>
              <Input
                value={tokenExpiresAt}
                onChange={(event) => setTokenExpiresAt(event.target.value)}
                placeholder="2026-12-31T23:59:59.000Z"
              />
            </label>
            <Button
              disabled={!user || issuingToken || !tokenName.trim()}
              onClick={() => void handleCreateToken()}
            >
              {issuingToken ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <KeyRoundIcon className="mr-2 size-4" />}
              签发
            </Button>
          </div>

          <div className="space-y-1 border-t border-border/70 pt-1">
            {tokens.length > 0 ? (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-start justify-between gap-3 border-b border-border/60 py-3"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{token.name}</div>
                    <div className="text-xs text-muted-foreground">创建：{formatTime(token.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      最近使用：{token.lastUsedAt ? formatTime(token.lastUsedAt) : "未使用"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      状态：{isRevoked(token) ? "revoked" : "active"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRevoked(token) || busyTokenId === token.id}
                    onClick={() => {
                      void (async () => {
                        try {
                          setBusyTokenId(token.id)
                          await onRevokeToken({
                            tokenId: token.id,
                          })
                        } finally {
                          setBusyTokenId("")
                        }
                      })()
                    }}
                  >
                    {busyTokenId === token.id ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                    吊销
                  </Button>
                </div>
              ))
            ) : (
              <div className="py-6 text-sm text-muted-foreground">
                当前还没有 token。
              </div>
            )}
          </div>
        </DashboardModule>
      </div>
    </section>
  )
}
