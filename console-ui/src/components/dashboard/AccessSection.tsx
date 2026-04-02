/**
 * Global Access 管理页。
 *
 * 关键点（中文）
 * - 统一承接 Console 级多用户、角色分配与 token 管理。
 * - 左侧维护用户目录，右侧聚焦当前选中用户的 token 生命周期。
 */

import * as React from "react"
import {
  KeyRoundIcon,
  Loader2Icon,
  UserPlusIcon,
} from "lucide-react"
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@downcity/ui"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import type {
  UiAuthAdminIssuedToken,
  UiAuthAdminRoleCatalogItem,
  UiAuthAdminTokenSummary,
  UiAuthAdminUserSummary,
} from "@/types/AuthAdmin"

function formatRoleNames(user: UiAuthAdminUserSummary): string {
  return (Array.isArray(user.roles) ? user.roles : []).join(", ") || "-"
}

function isRevoked(token: UiAuthAdminTokenSummary): boolean {
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
   * 角色目录。
   */
  roles: UiAuthAdminRoleCatalogItem[]

  /**
   * 用户列表。
   */
  users: UiAuthAdminUserSummary[]

  /**
   * 当前选中用户。
   */
  selectedUser: UiAuthAdminUserSummary | null

  /**
   * 当前选中用户的 token 列表。
   */
  tokens: UiAuthAdminTokenSummary[]

  /**
   * 是否正在加载用户目录。
   */
  loading: boolean

  /**
   * 是否正在加载 token 目录。
   */
  tokensLoading: boolean

  /**
   * 最近一次新签发的明文 token。
   */
  latestIssuedToken: UiAuthAdminIssuedToken | null

  /**
   * 时间格式化器。
   */
  formatTime: (value?: string | number | null) => string

  /**
   * 选择用户。
   */
  onSelectUser: (userId: string) => Promise<void>

  /**
   * 刷新用户目录。
   */
  onRefreshUsers: () => Promise<void>

  /**
   * 创建用户。
   */
  onCreateUser: (input: {
    username: string
    password: string
    displayName?: string
    roleName: string
  }) => Promise<void>

  /**
   * 更新用户展示名或状态。
   */
  onUpdateUser: (input: {
    userId: string
    displayName?: string
    status: "active" | "disabled"
  }) => Promise<void>

  /**
   * 更新用户角色。
   */
  onSetUserRole: (input: {
    userId: string
    roleName: string
  }) => Promise<void>

  /**
   * 为用户签发 token。
   */
  onCreateToken: (input: {
    userId: string
    name: string
    expiresAt?: string
  }) => Promise<void>

  /**
   * 吊销 token。
   */
  onRevokeToken: (input: {
    userId: string
    tokenId: string
  }) => Promise<void>

  /**
   * 清理最近一次明文 token。
   */
  onClearLatestIssuedToken: () => void
}

export function AccessSection(props: AccessSectionProps) {
  const {
    roles,
    users,
    selectedUser,
    tokens,
    loading,
    tokensLoading,
    latestIssuedToken,
    formatTime,
    onSelectUser,
    onRefreshUsers,
    onCreateUser,
    onUpdateUser,
    onSetUserRole,
    onCreateToken,
    onRevokeToken,
    onClearLatestIssuedToken,
  } = props
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createUsername, setCreateUsername] = React.useState("")
  const [createPassword, setCreatePassword] = React.useState("")
  const [createDisplayName, setCreateDisplayName] = React.useState("")
  const [createRoleName, setCreateRoleName] = React.useState(() => String(roles[0]?.name || "viewer"))
  const [creatingUser, setCreatingUser] = React.useState(false)
  const [savingUserId, setSavingUserId] = React.useState("")
  const [issuingToken, setIssuingToken] = React.useState(false)
  const [tokenName, setTokenName] = React.useState("chrome-extension")
  const [tokenExpiresAt, setTokenExpiresAt] = React.useState("")

  const activeUserCount = React.useMemo(
    () => users.filter((item) => item.status === "active").length,
    [users],
  )
  const selectedRoleName = String(selectedUser?.roles?.[0] || "-")

  React.useEffect(() => {
    const fallbackRole = String(roles[0]?.name || "viewer")
    setCreateRoleName((current) => current || fallbackRole)
  }, [roles])

  const handleCreateUser = React.useCallback(async () => {
    try {
      setCreatingUser(true)
      await onCreateUser({
        username: createUsername,
        password: createPassword,
        displayName: createDisplayName,
        roleName: createRoleName,
      })
      setCreateDialogOpen(false)
      setCreateUsername("")
      setCreatePassword("")
      setCreateDisplayName("")
      setCreateRoleName(String(roles[0]?.name || "viewer"))
    } finally {
      setCreatingUser(false)
    }
  }, [createDisplayName, createPassword, createRoleName, createUsername, onCreateUser, roles])

  const handleUpdateUser = React.useCallback(async (user: UiAuthAdminUserSummary, input: {
    displayName?: string
    status: "active" | "disabled"
  }) => {
    try {
      setSavingUserId(user.id)
      await onUpdateUser({
        userId: user.id,
        displayName: input.displayName,
        status: input.status,
      })
    } finally {
      setSavingUserId("")
    }
  }, [onUpdateUser])

  const handleSetRole = React.useCallback(async (user: UiAuthAdminUserSummary, roleName: string) => {
    try {
      setSavingUserId(user.id)
      await onSetUserRole({
        userId: user.id,
        roleName,
      })
    } finally {
      setSavingUserId("")
    }
  }, [onSetUserRole])

  const handleCreateToken = React.useCallback(async () => {
    if (!selectedUser) return
    try {
      setIssuingToken(true)
      await onCreateToken({
        userId: selectedUser.id,
        name: tokenName,
        expiresAt: tokenExpiresAt || undefined,
      })
    } finally {
      setIssuingToken(false)
    }
  }, [onCreateToken, selectedUser, tokenExpiresAt, tokenName])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Global / Access
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">多用户与 Token 管理</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            这里管理 Console 统一账户，不是 Agent 聊天渠道里的授权规则。用户、角色、状态和 Bearer Token
            都在这一页完成。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void onRefreshUsers()} disabled={loading}>
            {loading ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
            刷新
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlusIcon className="mr-2 size-4" />
            新建用户
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip label="users" value={String(users.length)} />
        <SummaryChip label="active" value={String(activeUserCount)} />
        <SummaryChip label="roles" value={String(roles.length)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardModule
          title="Users"
          description="每个用户至少绑定一个角色。当前页面按单角色编辑处理。"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-2 py-2">User</th>
                  <th className="px-2 py-2">Current</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const selected = selectedUser?.id === user.id
                  const roleValue = String(user.roles[0] || roles[0]?.name || "viewer")
                  const busy = savingUserId === user.id
                  return (
                    <tr
                      key={user.id}
                      className={selected ? "bg-secondary/70" : "border-b border-border/60"}
                    >
                      <td className="px-2 py-3 align-top">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => void onSelectUser(user.id)}
                        >
                          <div className="font-medium text-foreground">{user.username}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.displayName || "未设置展示名"}
                          </div>
                        </button>
                      </td>
                      <td className="px-2 py-3 align-top text-xs text-muted-foreground">
                        <div>角色：{formatRoleNames(user)}</div>
                        <div>更新：{formatTime(user.updatedAt)}</div>
                      </td>
                      <td className="px-2 py-3 align-top">
                        <select
                          className="h-8 w-full rounded-[11px] border border-border bg-background px-2.5 text-sm"
                          defaultValue={user.status}
                          disabled={busy}
                          onChange={(event) => {
                            void handleUpdateUser(user, {
                              displayName: user.displayName,
                              status: event.target.value === "disabled" ? "disabled" : "active",
                            })
                          }}
                        >
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                        <select
                          className="h-8 w-full rounded-[11px] border border-border bg-background px-2.5 text-sm"
                          value={roleValue}
                          disabled={busy}
                          onChange={(event) => {
                            void handleSetRole(user, event.target.value)
                          }}
                        >
                          {roles.map((role) => (
                            <option key={role.name} value={role.name}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={selected ? "secondary" : "ghost"}
                            onClick={() => void onSelectUser(user.id)}
                          >
                            管理 Token
                          </Button>
                          {busy ? (
                            <span className="inline-flex items-center text-xs text-muted-foreground">
                              <Loader2Icon className="mr-1 size-3 animate-spin" />
                              保存中
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DashboardModule>

        <DashboardModule
          title="Tokens"
          description={
            selectedUser
              ? `当前用户：${selectedUser.username} · 角色：${selectedRoleName}`
              : "先从左侧选择一个用户"
          }
          actions={tokensLoading ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
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
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Token Name</span>
              <Input value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Expires At</span>
              <Input
                value={tokenExpiresAt}
                onChange={(event) => setTokenExpiresAt(event.target.value)}
                placeholder="2026-12-31T23:59:59.000Z"
              />
            </label>
            <Button
              disabled={!selectedUser || issuingToken}
              onClick={() => void handleCreateToken()}
            >
              {issuingToken ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <KeyRoundIcon className="mr-2 size-4" />}
              签发
            </Button>
          </div>

          <div className="space-y-1 border-t border-border/70 pt-1">
            {selectedUser ? (
              tokens.length > 0 ? (
                tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-start justify-between gap-3 border-b border-border/60 py-3"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{token.name}</div>
                      <div className="text-xs text-muted-foreground">
                        创建：{formatTime(token.createdAt)}
                      </div>
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
                      disabled={isRevoked(token)}
                      onClick={() => void onRevokeToken({
                        userId: selectedUser.id,
                        tokenId: token.id,
                      })}
                    >
                      吊销
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-6 text-sm text-muted-foreground">
                  当前用户还没有 token。
                </div>
              )
            ) : (
              <div className="py-6 text-sm text-muted-foreground">
                先从左侧选中一个用户，再管理 token。
              </div>
            )}
          </div>
        </DashboardModule>
      </div>

      <DashboardModule
        title="Roles"
        description="默认角色目录是 admin / operator / viewer。"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <div key={role.name} className="space-y-2 border-b border-border/60 pb-3">
              <div className="font-medium text-foreground">{role.name}</div>
              <p className="text-sm leading-6 text-muted-foreground">{role.description}</p>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(role.permissions) ? role.permissions : []).map((permission) => (
                  <span
                    key={`${role.name}:${permission}`}
                    className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DashboardModule>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>新建统一账户用户</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="space-y-1.5">
              <Label>用户名</Label>
              <Input value={createUsername} onChange={(event) => setCreateUsername(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <Label>密码</Label>
              <Input
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <Label>展示名称</Label>
              <Input
                value={createDisplayName}
                onChange={(event) => setCreateDisplayName(event.target.value)}
                placeholder="可选"
              />
            </label>
            <label className="space-y-1.5">
              <Label>角色</Label>
              <select
                className="h-10 rounded-[12px] border border-border bg-background px-3 text-sm"
                value={createRoleName}
                onChange={(event) => setCreateRoleName(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={`create:${role.name}`} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={creatingUser} onClick={() => void handleCreateUser()}>
              {creatingUser ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
              创建用户
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
