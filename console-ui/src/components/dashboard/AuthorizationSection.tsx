/**
 * Agent 授权管理主视图。
 *
 * 关键点（中文）
 * - 角色是全局定义，只维护一套 role / permission。
 * - 平台仅区分来源渠道，负责 user 到 role 的绑定。
 * - 页面按“摘要 -> 角色与默认分组 -> 用户目录”组织，避免配置页过重。
 */

import * as React from "react"
import {
  MessagesSquareIcon,
  RefreshCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type {
  UiAgentOption,
  UiChatAuthorizationChannelConfig,
  UiChatAuthorizationChat,
  UiChatAuthorizationResponse,
  UiChatAuthorizationRole,
  UiChatAuthorizationUser,
} from "@/types/Dashboard"

type AuthorizationChannel = "telegram" | "feishu" | "qq"
type AuthorizationPermission =
  | "chat.dm.use"
  | "chat.group.use"
  | "auth.manage.users"
  | "auth.manage.roles"
  | "agent.view.logs"
  | "agent.manage"

type AuthorizationFormState = {
  roles: Record<string, UiChatAuthorizationRole>
  channels: Partial<Record<AuthorizationChannel, UiChatAuthorizationChannelConfig>>
}

type AuthorizationActionInput = {
  action: "setUserRole"
  channel: AuthorizationChannel
  userId?: string
  roleId?: string
}

type DirectoryChannelFilter = "all" | AuthorizationChannel

const AUTHORIZATION_CHANNELS: AuthorizationChannel[] = ["telegram", "feishu", "qq"]
const PERMISSIONS: AuthorizationPermission[] = [
  "chat.dm.use",
  "chat.group.use",
  "auth.manage.users",
  "auth.manage.roles",
  "agent.view.logs",
  "agent.manage",
]

const PERMISSION_LABELS: Record<AuthorizationPermission, string> = {
  "chat.dm.use": "DM",
  "chat.group.use": "Group",
  "auth.manage.users": "Users",
  "auth.manage.roles": "Roles",
  "agent.view.logs": "Logs",
  "agent.manage": "Agent",
}

function normalizeText(value: unknown): string {
  return String(value || "").trim()
}

function normalizeRoleId(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "-")
}

function normalizeRoleRecord(
  input: Record<string, UiChatAuthorizationRole> | undefined,
): Record<string, UiChatAuthorizationRole> {
  const raw = input && typeof input === "object" ? input : {}
  const out: Record<string, UiChatAuthorizationRole> = {}
  for (const [rawRoleId, role] of Object.entries(raw)) {
    const roleId = normalizeRoleId(role?.roleId || rawRoleId)
    if (!roleId) continue
    out[roleId] = {
      roleId,
      name: normalizeText(role?.name) || roleId,
      permissions: [...new Set((role?.permissions || []).filter(Boolean))] as AuthorizationPermission[],
    }
  }
  return out
}

function buildDefaultRoles(): Record<string, UiChatAuthorizationRole> {
  return {
    default: { roleId: "default", name: "Default", permissions: [] },
    member: {
      roleId: "member",
      name: "Member",
      permissions: ["chat.dm.use", "chat.group.use"],
    },
    admin: {
      roleId: "admin",
      name: "Admin",
      permissions: [...PERMISSIONS],
    },
  }
}

function cloneConfig(input: UiChatAuthorizationResponse["config"]): AuthorizationFormState {
  const rawRoles = normalizeRoleRecord(input?.roles)
  return {
    roles: Object.keys(rawRoles).length > 0 ? rawRoles : buildDefaultRoles(),
    channels: JSON.parse(JSON.stringify(input?.channels || {})) as AuthorizationFormState["channels"],
  }
}

function getChannelConfig(
  state: AuthorizationFormState,
  channel: AuthorizationChannel,
): UiChatAuthorizationChannelConfig {
  return state.channels[channel] || {}
}

function updateChannelConfig(
  state: AuthorizationFormState,
  channel: AuthorizationChannel,
  patch: UiChatAuthorizationChannelConfig,
): AuthorizationFormState {
  return {
    ...state,
    channels: {
      ...state.channels,
      [channel]: {
        ...getChannelConfig(state, channel),
        ...patch,
      },
    },
  }
}

function getRoles(state: AuthorizationFormState): UiChatAuthorizationRole[] {
  return Object.values(normalizeRoleRecord(state.roles)).sort((a, b) =>
    a.roleId.localeCompare(b.roleId),
  )
}

function getUserRoleId(
  user: UiChatAuthorizationUser,
  channelConfig: UiChatAuthorizationChannelConfig | undefined,
): string {
  const explicit = normalizeText(channelConfig?.userRoles?.[user.userId])
  return explicit || normalizeText(channelConfig?.defaultUserRoleId) || "default"
}

function hasPermission(
  role: UiChatAuthorizationRole | undefined,
  permission: AuthorizationPermission,
): boolean {
  return Array.isArray(role?.permissions) && role.permissions.includes(permission)
}

function isGroupChat(chat: UiChatAuthorizationChat): boolean {
  const type = normalizeText(chat.chatType).toLowerCase()
  return type !== "" && type !== "private" && type !== "p2p" && type !== "c2c"
}

function isAuthorizationChannel(value: string): value is AuthorizationChannel {
  return AUTHORIZATION_CHANNELS.includes(value as AuthorizationChannel)
}

function buildConfigPayload(
  form: AuthorizationFormState,
): NonNullable<UiChatAuthorizationResponse["config"]> {
  return {
    roles: normalizeRoleRecord(form.roles),
    channels: AUTHORIZATION_CHANNELS.reduce((result, channel) => {
      const current = getChannelConfig(form, channel)
      result[channel] = {
        defaultUserRoleId: normalizeText(current.defaultUserRoleId) || "default",
        userRoles: { ...(current.userRoles || {}) },
      }
      return result
    }, {} as NonNullable<UiChatAuthorizationResponse["config"]>["channels"]),
  }
}

function countRoleAssignments(params: {
  roleId: string
  channels: AuthorizationFormState["channels"]
  users: UiChatAuthorizationUser[]
}): { users: number } {
  let userCount = 0
  for (const user of params.users) {
    const channel = normalizeText(user.channel).toLowerCase()
    if (!isAuthorizationChannel(channel)) continue
    const channelConfig = params.channels[channel]
    if (getUserRoleId(user, channelConfig) === params.roleId) userCount += 1
  }
  return { users: userCount }
}

function getChannelSurfaceClass(channel: AuthorizationChannel): string {
  if (channel === "telegram") return "border-sky-500/20 bg-sky-500/8 text-sky-700"
  if (channel === "feishu") return "border-blue-500/20 bg-blue-500/8 text-blue-700"
  return "border-emerald-500/20 bg-emerald-500/8 text-emerald-700"
}

function matchesKeyword(parts: Array<string | undefined>, keyword: string): boolean {
  if (!keyword) return true
  const haystack = parts.map((part) => normalizeText(part).toLowerCase()).join(" ")
  return haystack.includes(keyword)
}

function StatChip(props: {
  label: string
  value: React.ReactNode
  tone?: "default" | "success"
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "inline-flex min-w-[8.25rem] items-center gap-2 rounded-full border px-3 py-2",
        props.tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-700"
          : "border-border/70 bg-secondary/60 text-foreground",
      )}
    >
      {props.icon ? <span className="text-muted-foreground">{props.icon}</span> : null}
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{props.label}</span>
      <span className="ml-auto text-sm font-semibold">{props.value}</span>
    </div>
  )
}

function ChannelBadge(props: { channel: AuthorizationChannel }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px]",
        getChannelSurfaceClass(props.channel),
      )}
    >
      {props.channel}
    </span>
  )
}

export interface AuthorizationSectionProps {
  authorization: UiChatAuthorizationResponse | null
  loading: boolean
  selectedAgent: UiAgentOption | null
  formatTime: (ts?: number | string) => string
  onRefresh: () => Promise<void>
  onSaveConfig: (config: NonNullable<UiChatAuthorizationResponse["config"]>) => Promise<void>
  onRunAction: (input: AuthorizationActionInput) => Promise<void>
}

export function AuthorizationSection(props: AuthorizationSectionProps) {
  const { authorization, selectedAgent, formatTime, onRefresh, onSaveConfig, onRunAction } = props
  const [form, setForm] = React.useState<AuthorizationFormState>(() => cloneConfig(undefined))
  const [saving, setSaving] = React.useState(false)
  const [newRoleDraft, setNewRoleDraft] = React.useState("")
  const [channelFilter, setChannelFilter] = React.useState<DirectoryChannelFilter>("all")
  const [searchKeyword, setSearchKeyword] = React.useState("")

  React.useEffect(() => {
    setForm(cloneConfig(authorization?.config))
  }, [authorization?.config])

  const observedUsers = React.useMemo(
    () => (Array.isArray(authorization?.users) ? authorization.users : []),
    [authorization?.users],
  )
  const observedChats = React.useMemo(
    () => (Array.isArray(authorization?.chats) ? authorization.chats : []),
    [authorization?.chats],
  )
  const roles = React.useMemo(() => getRoles(form), [form])
  const currentPayload = React.useMemo(() => buildConfigPayload(form), [form])
  const persistedPayload = React.useMemo(
    () => buildConfigPayload(cloneConfig(authorization?.config)),
    [authorization?.config],
  )
  const hasUnsavedChanges = React.useMemo(
    () => JSON.stringify(currentPayload) !== JSON.stringify(persistedPayload),
    [currentPayload, persistedPayload],
  )
  const groupChatCount = React.useMemo(
    () => observedChats.filter(isGroupChat).length,
    [observedChats],
  )

  const filteredUsers = React.useMemo(() => {
    const keyword = normalizeText(searchKeyword).toLowerCase()
    return observedUsers.filter((user) => {
      const channel = normalizeText(user.channel).toLowerCase()
      if (!isAuthorizationChannel(channel)) return false
      if (channelFilter !== "all" && channel !== channelFilter) return false
      return matchesKeyword(
        [user.username, user.userId, user.lastChatId, user.lastChatTitle, user.lastChatType],
        keyword,
      )
    })
  }, [channelFilter, observedUsers, searchKeyword])

  const filteredChats = React.useMemo(() => {
    const keyword = normalizeText(searchKeyword).toLowerCase()
    return observedChats.filter((chat) => {
      const channel = normalizeText(chat.channel).toLowerCase()
      if (!isAuthorizationChannel(channel)) return false
      if (!isGroupChat(chat)) return false
      if (channelFilter !== "all" && channel !== channelFilter) return false
      return matchesKeyword(
        [chat.chatTitle, chat.chatId, chat.chatType, chat.lastActorId, chat.lastActorName],
        keyword,
      )
    })
  }, [channelFilter, observedChats, searchKeyword])

  const handleSave = React.useCallback(async () => {
    try {
      setSaving(true)
      await onSaveConfig(currentPayload)
    } finally {
      setSaving(false)
    }
  }, [currentPayload, onSaveConfig])

  return (
    <section className="space-y-5">
      <DashboardModule
        title="Authorization"
        description={`当前 agent：${normalizeText(selectedAgent?.name || selectedAgent?.id || "未选择") || "未选择"}。这里只有权限组，没有 master 身份；收到消息时，只按发消息用户所属分组做判断。`}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-[11px]"
              onClick={() => void onRefresh()}
            >
              <RefreshCcwIcon className="mr-1.5 size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-[11px]"
              disabled={saving || !hasUnsavedChanges}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2.5">
          <StatChip label="Roles" value={roles.length} icon={<ShieldCheckIcon className="size-3.5" />} />
          <StatChip label="Users" value={observedUsers.length} icon={<UsersIcon className="size-3.5" />} />
          <StatChip label="Groups" value={groupChatCount} icon={<MessagesSquareIcon className="size-3.5" />} />
          <StatChip
            label="Draft"
            value={hasUnsavedChanges ? "Pending" : "Synced"}
            tone={hasUnsavedChanges ? "default" : "success"}
            icon={<SlidersHorizontalIcon className="size-3.5" />}
          />
        </div>

        <div className="rounded-[18px] border border-border/70 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
          新用户先进入各平台默认分组；群聊和频道本身不配置权限，只记录最近活跃会话。真正放行与否，始终取决于发消息用户自己的分组。
        </div>
      </DashboardModule>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
        <DashboardModule
          title="Roles"
          description="只维护一套全局权限组。平台只负责把用户绑定到组，不再单独引入主人、群白名单或审批流。"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-10 min-w-[13rem] rounded-[14px] bg-secondary/70"
              value={newRoleDraft}
              onChange={(event) => setNewRoleDraft(event.target.value)}
              placeholder="new role id"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 rounded-[14px] bg-secondary/70 px-4"
              onClick={() => {
                const roleId = normalizeRoleId(newRoleDraft)
                if (!roleId) return
                setForm((current) => ({
                  ...current,
                  roles: {
                    ...current.roles,
                    [roleId]: {
                      roleId,
                      name: roleId,
                      permissions: [],
                    },
                  },
                }))
                setNewRoleDraft("")
              }}
            >
              Add Role
            </Button>
          </div>

          <div className="space-y-2">
            {roles.map((role) => {
              const assignment = countRoleAssignments({
                roleId: role.roleId,
                channels: form.channels,
                users: observedUsers,
              })
              return (
                <article
                  key={`role:${role.roleId}`}
                  className="rounded-[18px] border border-border/60 bg-secondary/35 px-4 py-4 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-background/80 font-mono text-[11px] text-muted-foreground"
                          >
                            {role.roleId}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="bg-background/80 text-muted-foreground"
                          >
                            {`${assignment.users} users`}
                          </Badge>
                          {hasPermission(role, "agent.manage") ? (
                            <Badge className="bg-emerald-600 text-white">admin</Badge>
                          ) : null}
                        </div>
                        <input
                          className="h-10 w-full rounded-[12px] border border-transparent bg-background/90 px-3 text-sm text-foreground outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
                          value={role.name}
                          onChange={(event) => {
                            setForm((current) => ({
                              ...current,
                              roles: {
                                ...current.roles,
                                [role.roleId]: {
                                  ...role,
                                  name: event.target.value,
                                },
                              },
                            }))
                          }}
                        />
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {role.permissions.length > 0
                          ? `${role.permissions.length} permissions`
                          : "no permissions"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {PERMISSIONS.map((permission) => {
                        const enabled = hasPermission(role, permission)
                        return (
                          <button
                            key={`${role.roleId}:${permission}`}
                            type="button"
                            className={
                              enabled
                                ? "inline-flex h-8 items-center rounded-full border border-foreground/10 bg-foreground px-3 text-[11px] font-medium text-background transition hover:bg-foreground/85"
                                : "inline-flex h-8 items-center rounded-full border border-border/60 bg-background/85 px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-background hover:text-foreground"
                            }
                            onClick={() => {
                              setForm((current) => {
                                const currentRole = current.roles[role.roleId] || role
                                const permissions = new Set(currentRole.permissions || [])
                                if (permissions.has(permission)) {
                                  permissions.delete(permission)
                                } else {
                                  permissions.add(permission)
                                }
                                return {
                                  ...current,
                                  roles: {
                                    ...current.roles,
                                    [role.roleId]: {
                                      ...currentRole,
                                      permissions: [...permissions] as AuthorizationPermission[],
                                    },
                                  },
                                }
                              })
                            }}
                          >
                            {PERMISSION_LABELS[permission]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </DashboardModule>

        <DashboardModule
          title="Channel Defaults"
          description="每个平台只需要一个默认分组。未单独分配的用户，会直接继承这里的设置。"
        >
          <div className="space-y-2">
            {AUTHORIZATION_CHANNELS.map((channel) => {
              const channelConfig = getChannelConfig(form, channel)
              return (
                <article
                  key={channel}
                  className="rounded-[18px] border border-border/60 bg-secondary/35 px-4 py-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <ChannelBadge channel={channel} />
                    <span className="text-sm font-medium text-foreground">default group</span>
                  </div>
                  <label className="block space-y-2">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      New User
                    </div>
                    <select
                      className="h-10 w-full rounded-[14px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
                      value={normalizeText(channelConfig.defaultUserRoleId) || "default"}
                      onChange={(event) => {
                        setForm((current) =>
                          updateChannelConfig(current, channel, {
                            defaultUserRoleId: event.target.value,
                          }),
                        )
                      }}
                    >
                      {roles.map((role) => (
                        <option key={`${channel}:default-user:${role.roleId}`} value={role.roleId}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              )
            })}
          </div>

          <div className="rounded-[18px] border border-dashed border-border/70 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
            如果一个用户在对应平台还没有显式绑定角色，就会直接使用这里的默认分组。
          </div>
        </DashboardModule>
      </div>

      <DashboardModule
        title="Directory"
        description="这是日常最常用的工作区。上半部分管理用户分组，下半部分只观察最近活跃的群聊与频道。"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Users</div>
            <div className="text-xs text-muted-foreground">
              按平台筛选、搜索后，直接把用户切换到目标分组。
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[14rem]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-[14px] bg-secondary/70 pl-9"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="search user / chat / id"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", ...AUTHORIZATION_CHANNELS] as DirectoryChannelFilter[]).map((item) => (
                <Button
                  key={`channel-filter:${item}`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "rounded-[12px]",
                    item === channelFilter ? "bg-secondary" : "",
                  )}
                  onClick={() => setChannelFilter(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Separator className="bg-border/70" />

        {filteredUsers.length === 0 ? (
          <div className="rounded-[18px] bg-secondary/50 px-4 py-6 text-sm text-muted-foreground">
            没有匹配的用户。
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => {
              const channel = normalizeText(user.channel).toLowerCase()
              if (!isAuthorizationChannel(channel)) return null
              const channelConfig = getChannelConfig(form, channel)
              const roleId = getUserRoleId(user, channelConfig)
              const role = roles.find((item) => item.roleId === roleId)
              return (
                <article
                  key={`${user.channel}:${user.userId}`}
                  className="rounded-[18px] border border-border/60 bg-secondary/35 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {user.username || user.userId}
                        </span>
                        <ChannelBadge channel={channel} />
                        {hasPermission(role, "agent.manage") ? (
                          <Badge className="bg-emerald-600 text-white">admin</Badge>
                        ) : null}
                        {hasPermission(role, "chat.group.use") ? (
                          <Badge
                            variant="secondary"
                            className="bg-background/80 text-muted-foreground"
                          >
                            group enabled
                          </Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{user.userId}</div>
                      <div className="text-xs text-muted-foreground">
                        {`${user.lastChatTitle || user.lastChatId || "-"} · ${user.lastChatType || "-"} · seen ${formatTime(user.lastSeenAt)}`}
                      </div>
                    </div>

                    <select
                      className="h-10 min-w-[11rem] rounded-[14px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
                      value={roleId}
                      onChange={(event) => {
                        void onRunAction({
                          action: "setUserRole",
                          channel,
                          userId: user.userId,
                          roleId: event.target.value,
                        })
                      }}
                    >
                      {roles.map((roleItem) => (
                        <option
                          key={`${channel}:user:${user.userId}:${roleItem.roleId}`}
                          value={roleItem.roleId}
                        >
                          {roleItem.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <Separator className="bg-border/70" />

        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Observed Groups</div>
          <div className="text-xs text-muted-foreground">
            群聊和频道只用于观测最近活跃会话，不参与权限判断。
          </div>
        </div>

        {filteredChats.length === 0 ? (
          <div className="rounded-[18px] bg-secondary/50 px-4 py-6 text-sm text-muted-foreground">
            没有匹配的群聊或频道。
          </div>
        ) : (
          <div className="space-y-2">
            {filteredChats.map((chat) => {
              const channel = normalizeText(chat.channel).toLowerCase()
              if (!isAuthorizationChannel(channel)) return null
              return (
                <article
                  key={`${chat.channel}:${chat.chatId}`}
                  className="rounded-[18px] border border-border/60 bg-secondary/35 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {chat.chatTitle || chat.chatId}
                        </span>
                        <ChannelBadge channel={channel} />
                        <Badge
                          variant="secondary"
                          className="bg-background/80 text-muted-foreground"
                        >
                          {chat.chatType || "group"}
                        </Badge>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{chat.chatId}</div>
                      <div className="text-xs text-muted-foreground">
                        {`last actor ${chat.lastActorName || chat.lastActorId || "-"} · seen ${formatTime(chat.lastSeenAt)}`}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>
    </section>
  )
}
