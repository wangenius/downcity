/**
 * Agent 授权管理主视图。
 *
 * 关键点（中文）
 * - 主页面只保留运营视角的摘要与目录，复杂配置收进 dialog，减轻认知负担。
 * - 授权模型仍然是 role / permission / binding；这里只是重新组织交互层级。
 * - 角色与权限都展示 name + description，避免用户面对原始字符串猜含义。
 */

import * as React from "react"
import {
  LockKeyholeIcon,
  MessagesSquareIcon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  UiAgentOption,
  UiChatAuthorizationCatalog,
  UiChatAuthorizationChannelConfig,
  UiChatAuthorizationChat,
  UiChatAuthorizationPermission,
  UiChatAuthorizationPermissionMeta,
  UiChatAuthorizationResponse,
  UiChatAuthorizationRole,
  UiChatAuthorizationUser,
} from "@/types/Dashboard"

type AuthorizationChannel = string
type AuthorizationPermission = UiChatAuthorizationPermission
type DirectoryChannelFilter = "all" | AuthorizationChannel

type AuthorizationPermissionDetail = UiChatAuthorizationPermissionMeta & {
  name: string
  description: string
}

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

const ROLE_ID_PREFIX = "role"
const PROTECTED_ROLE_IDS = new Set(["default"])
const RESERVED_ROLE_ORDER = ["default", "member", "admin"]

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
      ...(normalizeText(role?.description) ? { description: normalizeText(role?.description) } : {}),
      permissions: [...new Set((role?.permissions || []).filter(Boolean))] as AuthorizationPermission[],
    }
  }
  return out
}

function resolveAuthorizationChannels(
  catalog: UiChatAuthorizationCatalog | undefined,
): AuthorizationChannel[] {
  return (Array.isArray(catalog?.channels) ? catalog.channels : [])
    .map((channel) => normalizeText(channel).toLowerCase())
    .filter(Boolean)
    .filter((channel, index, array) => array.indexOf(channel) === index)
}

function resolvePermissionCatalog(
  catalog: UiChatAuthorizationCatalog | undefined,
): AuthorizationPermissionDetail[] {
  const permissions = (Array.isArray(catalog?.permissions) ? catalog.permissions : [])
    .map((permission) => normalizeText(permission))
    .filter(Boolean)
    .filter((permission, index, array) => array.indexOf(permission) === index) as AuthorizationPermission[]
  const permissionLabels =
    catalog?.permissionLabels && typeof catalog.permissionLabels === "object"
      ? catalog.permissionLabels
      : {}
  const permissionMeta =
    catalog?.permissionMeta && typeof catalog.permissionMeta === "object"
      ? catalog.permissionMeta
      : {}
  return permissions.map((permission) => {
    const meta = permissionMeta[permission]
    return {
      permission,
      name: normalizeText(meta?.name) || normalizeText(permissionLabels[permission]) || permission,
      description:
        normalizeText(meta?.description) || "该权限已接入 auth runtime，用于实际入站消息授权判定。",
    }
  })
}

function cloneConfig(
  input: UiChatAuthorizationResponse["config"],
  channels: AuthorizationChannel[],
): AuthorizationFormState {
  return {
    roles: normalizeRoleRecord(input?.roles),
    channels: channels.reduce((result, channel) => {
      result[channel] = JSON.parse(
        JSON.stringify((input?.channels || {})[channel] || {}),
      ) as UiChatAuthorizationChannelConfig
      return result
    }, {} as AuthorizationFormState["channels"]),
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
  return Object.values(normalizeRoleRecord(state.roles)).sort((left, right) => {
    const leftReservedIndex = RESERVED_ROLE_ORDER.indexOf(left.roleId)
    const rightReservedIndex = RESERVED_ROLE_ORDER.indexOf(right.roleId)
    if (leftReservedIndex >= 0 || rightReservedIndex >= 0) {
      if (leftReservedIndex === -1) return 1
      if (rightReservedIndex === -1) return -1
      return leftReservedIndex - rightReservedIndex
    }
    return left.name.localeCompare(right.name)
  })
}

function getUserRoleId(
  user: UiChatAuthorizationUser,
  channelConfig: UiChatAuthorizationChannelConfig | undefined,
): string {
  const explicit = normalizeText(channelConfig?.userRoles?.[user.userId])
  return explicit || normalizeText(channelConfig?.defaultUserRoleId) || "default"
}

function getExplicitUserRoleId(
  user: UiChatAuthorizationUser,
  channelConfig: UiChatAuthorizationChannelConfig | undefined,
): string | undefined {
  const explicit = normalizeText(channelConfig?.userRoles?.[user.userId])
  return explicit || undefined
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

function isAuthorizationChannel(
  value: string,
  channels: AuthorizationChannel[],
): value is AuthorizationChannel {
  return channels.includes(value as AuthorizationChannel)
}

function buildConfigPayload(
  form: AuthorizationFormState,
  channels: AuthorizationChannel[],
): NonNullable<UiChatAuthorizationResponse["config"]> {
  const nextChannels = channels.reduce((result, channel) => {
    const current = getChannelConfig(form, channel)
    result[channel] = {
      defaultUserRoleId: normalizeText(current.defaultUserRoleId) || "default",
      userRoles: { ...(current.userRoles || {}) },
    }
    return result
  }, {} as Record<string, UiChatAuthorizationChannelConfig>)

  return {
    roles: normalizeRoleRecord(form.roles),
    channels: nextChannels,
  }
}

function countRoleAssignments(params: {
  roleId: string
  channels: AuthorizationFormState["channels"]
  authorizationChannels: AuthorizationChannel[]
  users: UiChatAuthorizationUser[]
}): { users: number; defaults: number } {
  let userCount = 0
  let defaultCount = 0
  for (const channel of params.authorizationChannels) {
    if ((normalizeText(params.channels[channel]?.defaultUserRoleId) || "default") === params.roleId) {
      defaultCount += 1
    }
  }
  for (const user of params.users) {
    const channel = normalizeText(user.channel).toLowerCase()
    if (!isAuthorizationChannel(channel, params.authorizationChannels)) continue
    const channelConfig = params.channels[channel]
    if (getUserRoleId(user, channelConfig) === params.roleId) userCount += 1
  }
  return { users: userCount, defaults: defaultCount }
}

function getChannelSurfaceClass(channel: AuthorizationChannel): string {
  if (channel === "telegram") return "border-sky-500/20 bg-sky-500/8 text-sky-700"
  if (channel === "feishu") return "border-blue-500/20 bg-blue-500/8 text-blue-700"
  if (channel === "consoleui") return "border-zinc-500/20 bg-zinc-500/8 text-zinc-700"
  return "border-emerald-500/20 bg-emerald-500/8 text-emerald-700"
}

function matchesKeyword(parts: Array<string | undefined>, keyword: string): boolean {
  if (!keyword) return true
  const haystack = parts.map((part) => normalizeText(part).toLowerCase()).join(" ")
  return haystack.includes(keyword)
}

function canDeleteRole(roleId: string): boolean {
  return !PROTECTED_ROLE_IDS.has(roleId)
}

function resolveRoleFallbackName(
  roleId: string,
  roles: UiChatAuthorizationRole[],
): string {
  return roles.find((role) => role.roleId === roleId)?.name || roleId
}

function removeRoleFromState(
  state: AuthorizationFormState,
  roleId: string,
): AuthorizationFormState {
  if (!canDeleteRole(roleId)) return state
  const nextRoles = { ...state.roles }
  delete nextRoles[roleId]

  const nextChannels = Object.fromEntries(
    Object.entries(state.channels).map(([channel, config]) => {
      const current = config || {}
      const userRoles = Object.fromEntries(
        Object.entries(current.userRoles || {}).filter(([, boundRoleId]) => boundRoleId !== roleId),
      )
      return [
        channel,
        {
          ...current,
          defaultUserRoleId:
            normalizeText(current.defaultUserRoleId) === roleId
              ? "default"
              : normalizeText(current.defaultUserRoleId) || "default",
          userRoles,
        },
      ]
    }),
  ) as AuthorizationFormState["channels"]

  return {
    roles: nextRoles,
    channels: nextChannels,
  }
}

function createRoleIdDraft(input: string, roles: UiChatAuthorizationRole[]): string {
  const normalized = normalizeRoleId(input)
  if (normalized && !roles.some((role) => role.roleId === normalized)) return normalized
  let index = roles.length + 1
  while (roles.some((role) => role.roleId === `${ROLE_ID_PREFIX}-${index}`)) index += 1
  return `${ROLE_ID_PREFIX}-${index}`
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

function RoleBadge(props: { role: UiChatAuthorizationRole; compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border/70 bg-background/85 px-3 py-2",
        props.compact ? "min-w-[9rem]" : "",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{props.role.name}</span>
        {PROTECTED_ROLE_IDS.has(props.role.roleId) ? (
          <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">
            reserved
          </Badge>
        ) : null}
      </div>
      {!props.compact ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {normalizeText(props.role.description) || "未填写角色说明。"}
        </p>
      ) : null}
    </div>
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
  const confirm = useConfirmDialog()
  const catalog = React.useMemo(() => authorization?.catalog, [authorization?.catalog])
  const authorizationChannels = React.useMemo(
    () => resolveAuthorizationChannels(catalog),
    [catalog],
  )
  const permissionCatalog = React.useMemo(
    () => resolvePermissionCatalog(catalog),
    [catalog],
  )
  const [form, setForm] = React.useState<AuthorizationFormState>(() => cloneConfig(undefined, []))
  const [saving, setSaving] = React.useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = React.useState(false)
  const [channelDefaultsDialogOpen, setChannelDefaultsDialogOpen] = React.useState(false)
  const [selectedRoleId, setSelectedRoleId] = React.useState("default")
  const [newRoleDraft, setNewRoleDraft] = React.useState("")
  const [channelFilter, setChannelFilter] = React.useState<DirectoryChannelFilter>("all")
  const [searchKeyword, setSearchKeyword] = React.useState("")

  React.useEffect(() => {
    setForm(cloneConfig(authorization?.config, authorizationChannels))
  }, [authorization?.config, authorizationChannels])

  const observedUsers = React.useMemo(
    () => (Array.isArray(authorization?.users) ? authorization.users : []),
    [authorization?.users],
  )
  const observedChats = React.useMemo(
    () => (Array.isArray(authorization?.chats) ? authorization.chats : []),
    [authorization?.chats],
  )
  const roles = React.useMemo(() => getRoles(form), [form])
  const currentPayload = React.useMemo(
    () => buildConfigPayload(form, authorizationChannels),
    [authorizationChannels, form],
  )
  const persistedPayload = React.useMemo(
    () =>
      buildConfigPayload(
        cloneConfig(authorization?.config, authorizationChannels),
        authorizationChannels,
      ),
    [authorization?.config, authorizationChannels],
  )
  const hasUnsavedChanges = React.useMemo(
    () => JSON.stringify(currentPayload) !== JSON.stringify(persistedPayload),
    [currentPayload, persistedPayload],
  )
  const groupChatCount = React.useMemo(
    () => observedChats.filter(isGroupChat).length,
    [observedChats],
  )

  React.useEffect(() => {
    if (roles.length === 0) {
      setSelectedRoleId("default")
      return
    }
    if (!roles.some((role) => role.roleId === selectedRoleId)) {
      setSelectedRoleId(roles[0]?.roleId || "default")
    }
  }, [roles, selectedRoleId])

  const selectedRole = React.useMemo(
    () => roles.find((role) => role.roleId === selectedRoleId) || roles[0],
    [roles, selectedRoleId],
  )

  const filteredUsers = React.useMemo(() => {
    const keyword = normalizeText(searchKeyword).toLowerCase()
    return observedUsers.filter((user) => {
      const channel = normalizeText(user.channel).toLowerCase()
      if (!isAuthorizationChannel(channel, authorizationChannels)) return false
      if (channelFilter !== "all" && channel !== channelFilter) return false
      return matchesKeyword(
        [user.username, user.userId, user.lastChatId, user.lastChatTitle, user.lastChatType],
        keyword,
      )
    })
  }, [authorizationChannels, channelFilter, observedUsers, searchKeyword])

  const filteredChats = React.useMemo(() => {
    const keyword = normalizeText(searchKeyword).toLowerCase()
    return observedChats.filter((chat) => {
      const channel = normalizeText(chat.channel).toLowerCase()
      if (!isAuthorizationChannel(channel, authorizationChannels)) return false
      if (!isGroupChat(chat)) return false
      if (channelFilter !== "all" && channel !== channelFilter) return false
      return matchesKeyword(
        [chat.chatTitle, chat.chatId, chat.chatType, chat.lastActorId, chat.lastActorName],
        keyword,
      )
    })
  }, [authorizationChannels, channelFilter, observedChats, searchKeyword])

  const handleSave = React.useCallback(async () => {
    try {
      setSaving(true)
      await onSaveConfig(currentPayload)
    } finally {
      setSaving(false)
    }
  }, [currentPayload, onSaveConfig])

  const handleCreateRole = React.useCallback(() => {
    const roleId = createRoleIdDraft(newRoleDraft, roles)
    setForm((current) => ({
      ...current,
      roles: {
        ...current.roles,
        [roleId]: {
          roleId,
          name: normalizeText(newRoleDraft) || "New Role",
          description: "",
          permissions: [],
        },
      },
    }))
    setSelectedRoleId(roleId)
    setNewRoleDraft("")
  }, [newRoleDraft, roles])

  const handleDeleteRole = React.useCallback(async () => {
    if (!selectedRole || !canDeleteRole(selectedRole.roleId)) return
    const accepted = await confirm({
      title: `删除角色 ${selectedRole.name}`,
      description: "删除后，引用该角色的默认分组和用户绑定会回退到 default。",
      confirmText: "删除",
      confirmVariant: "destructive",
    })
    if (!accepted) return
    setForm((current) => removeRoleFromState(current, selectedRole.roleId))
  }, [confirm, selectedRole])

  return (
    <section className="space-y-5">
      <DashboardModule
        title="Authorization"
        description={`当前 agent：${normalizeText(selectedAgent?.name || selectedAgent?.id || "未选择") || "未选择"}。授权判断始终基于发消息用户自己的权限组，群聊与频道本身不持有权限。`}
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

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[22px] border border-border/70 bg-[linear-gradient(135deg,rgba(17,17,19,0.02),rgba(17,17,19,0.0))] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Role Policy</div>
                <p className="max-w-[34rem] text-sm leading-6 text-muted-foreground">
                  权限组仍然是核心模型，但配置不再堆在主页面。你可以在弹窗里维护角色的 name、description 和 permission 组合。
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="rounded-[12px] bg-background/85"
                onClick={() => setRoleDialogOpen(true)}
              >
                <Settings2Icon className="mr-1.5 size-4" />
                Manage Roles
              </Button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {roles.slice(0, 6).map((role) => (
                <RoleBadge key={role.roleId} role={role} compact />
              ))}
            </div>
          </article>

          <article className="rounded-[22px] border border-border/70 bg-secondary/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Channel Defaults</div>
                <p className="text-sm leading-6 text-muted-foreground">
                  每个平台只保留一个新用户默认组。未显式绑定的用户，会直接继承这里的角色。
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="rounded-[12px] bg-background/85"
                onClick={() => setChannelDefaultsDialogOpen(true)}
              >
                <Settings2Icon className="mr-1.5 size-4" />
                Edit Defaults
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {authorizationChannels.map((channel) => {
                const channelConfig = getChannelConfig(form, channel)
                const roleId = normalizeText(channelConfig.defaultUserRoleId) || "default"
                const role = roles.find((item) => item.roleId === roleId)
                return (
                  <div
                    key={`default:${channel}`}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-[16px] border border-border/60 bg-background/80 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ChannelBadge channel={channel} />
                        <span className="text-sm font-medium text-foreground">{role?.name || roleId}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {normalizeText(role?.description) || "未填写角色说明。"}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-background/90 font-mono text-[11px]">
                      {roleId}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </article>
        </div>

        <div className="rounded-[20px] border border-border/70 bg-secondary/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <LockKeyholeIcon className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">Permission Catalog</div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {permissionCatalog.map((permission) => (
              <article
                key={permission.permission}
                className="rounded-[16px] border border-border/60 bg-background/85 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-foreground">{permission.name}</div>
                  <Badge variant="outline" className="bg-background/90 font-mono text-[11px]">
                    {permission.permission}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{permission.description}</p>
              </article>
            ))}
          </div>
        </div>
      </DashboardModule>

      <DashboardModule
        title="Directory"
        description="日常只需要在这里处理用户分组。上半部分可直接调整用户角色，下半部分只观察最近活跃的群聊与频道。"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Users</div>
            <div className="text-xs text-muted-foreground">
              先按平台筛选，再搜索用户或会话；角色切换会立即写回授权配置。
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
              {(["all", ...authorizationChannels] as DirectoryChannelFilter[]).map((item) => (
                <Button
                  key={`channel-filter:${item}`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("rounded-[12px]", item === channelFilter ? "bg-secondary" : "")}
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
              if (!isAuthorizationChannel(channel, authorizationChannels)) return null
              const channelConfig = getChannelConfig(form, channel)
              const roleId = getUserRoleId(user, channelConfig)
              const explicitRoleId = getExplicitUserRoleId(user, channelConfig)
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
                        <Badge
                          variant="secondary"
                          className="bg-background/80 text-muted-foreground"
                        >
                          {explicitRoleId ? "custom binding" : "channel default"}
                        </Badge>
                        {hasPermission(role, "agent.manage") ? (
                          <Badge className="bg-emerald-600 text-white">admin</Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{user.userId}</div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {normalizeText(role?.description) || "未填写角色说明。"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {`${user.lastChatTitle || user.lastChatId || "-"} · ${user.lastChatType || "-"} · seen ${formatTime(user.lastSeenAt)}`}
                      </div>
                    </div>

                    <div className="min-w-[12rem] space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Role
                      </div>
                      <select
                        className="h-10 w-full rounded-[14px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
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
            群聊与频道只用于观测近期活跃会话，不参与授权判断。
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
              if (!isAuthorizationChannel(channel, authorizationChannels)) return null
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

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="w-[min(96vw,1040px)] p-0">
          <DialogHeader className="border-b border-border/70 bg-secondary/45 px-5 py-4">
            <DialogTitle>Role Policy</DialogTitle>
            <DialogDescription>
              在这里维护角色的 name、description 和权限组合。删除角色后，相关默认绑定会回退到 `default`。
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[76vh] gap-0 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-b border-border/70 bg-background/75 p-4 lg:border-r lg:border-b-0">
              <div className="flex gap-2">
                <Input
                  value={newRoleDraft}
                  onChange={(event) => setNewRoleDraft(event.target.value)}
                  placeholder="new role id"
                  className="h-10 rounded-[14px] bg-secondary/70"
                />
                <Button
                  type="button"
                  className="h-10 rounded-[14px] px-3"
                  onClick={handleCreateRole}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {roles.map((role) => {
                  const assignment = countRoleAssignments({
                    roleId: role.roleId,
                    channels: form.channels,
                    authorizationChannels,
                    users: observedUsers,
                  })
                  const active = role.roleId === selectedRole?.roleId
                  return (
                    <button
                      key={`role-nav:${role.roleId}`}
                      type="button"
                      className={cn(
                        "block w-full rounded-[18px] border px-3 py-3 text-left transition",
                        active
                          ? "border-foreground/12 bg-secondary text-foreground"
                          : "border-border/70 bg-background hover:bg-secondary/50",
                      )}
                      onClick={() => setSelectedRoleId(role.roleId)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{role.name}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {role.roleId}
                          </div>
                        </div>
                        {PROTECTED_ROLE_IDS.has(role.roleId) ? (
                          <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">
                            reserved
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        {`${assignment.users} users · ${assignment.defaults} defaults`}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-5">
              {selectedRole ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-lg">{selectedRole.name}</DialogTitle>
                        <Badge variant="outline" className="bg-background/90 font-mono text-[11px]">
                          {selectedRole.roleId}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        角色只负责描述“这个人能做什么”，具体绑定发生在用户目录和 channel default。
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-[12px] text-destructive hover:bg-destructive/8 hover:text-destructive"
                      disabled={!canDeleteRole(selectedRole.roleId)}
                      onClick={() => void handleDeleteRole()}
                    >
                      <Trash2Icon className="mr-1.5 size-4" />
                      Delete Role
                    </Button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Name</div>
                      <Input
                        value={selectedRole.name}
                        className="h-11 rounded-[16px] bg-secondary/65"
                        onChange={(event) => {
                          const value = event.target.value
                          setForm((current) => ({
                            ...current,
                            roles: {
                              ...current.roles,
                              [selectedRole.roleId]: {
                                ...(current.roles[selectedRole.roleId] || selectedRole),
                                name: value,
                              },
                            },
                          }))
                        }}
                      />
                    </label>

                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Description
                      </div>
                      <Textarea
                        value={selectedRole.description || ""}
                        className="min-h-[88px] rounded-[16px] bg-secondary/65"
                        onChange={(event) => {
                          const value = event.target.value
                          setForm((current) => ({
                            ...current,
                            roles: {
                              ...current.roles,
                              [selectedRole.roleId]: {
                                ...(current.roles[selectedRole.roleId] || selectedRole),
                                description: value,
                              },
                            },
                          }))
                        }}
                        placeholder="写清楚这个角色通常给谁、覆盖什么边界。"
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">Permissions</div>
                        <p className="text-sm text-muted-foreground">
                          这些权限会被 auth runtime 实际用于消息放行与管理动作控制。
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-secondary text-muted-foreground">
                        {(selectedRole.permissions || []).length} enabled
                      </Badge>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      {permissionCatalog.map((permission) => {
                        const enabled = hasPermission(selectedRole, permission.permission)
                        return (
                          <button
                            key={`${selectedRole.roleId}:${permission.permission}`}
                            type="button"
                            className={cn(
                              "rounded-[18px] border px-4 py-4 text-left transition",
                              enabled
                                ? "border-foreground/10 bg-foreground text-background"
                                : "border-border/70 bg-background hover:bg-secondary/45",
                            )}
                            onClick={() => {
                              setForm((current) => {
                                const currentRole = current.roles[selectedRole.roleId] || selectedRole
                                const permissions = new Set(currentRole.permissions || [])
                                if (permissions.has(permission.permission)) {
                                  permissions.delete(permission.permission)
                                } else {
                                  permissions.add(permission.permission)
                                }
                                return {
                                  ...current,
                                  roles: {
                                    ...current.roles,
                                    [selectedRole.roleId]: {
                                      ...currentRole,
                                      permissions: [...permissions] as AuthorizationPermission[],
                                    },
                                  },
                                }
                              })
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{permission.name}</span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-5 rounded-full px-1.5 font-mono text-[10px]",
                                  enabled
                                    ? "border-white/18 bg-white/10 text-white"
                                    : "bg-background/90 text-muted-foreground",
                                )}
                              >
                                {permission.permission}
                              </Badge>
                            </div>
                            <p
                              className={cn(
                                "mt-2 text-sm leading-6",
                                enabled ? "text-background/82" : "text-muted-foreground",
                              )}
                            >
                              {permission.description}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 bg-background px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={channelDefaultsDialogOpen} onOpenChange={setChannelDefaultsDialogOpen}>
        <DialogContent className="w-[min(92vw,720px)] p-0">
          <DialogHeader className="border-b border-border/70 bg-secondary/45 px-5 py-4">
            <DialogTitle>Channel Defaults</DialogTitle>
            <DialogDescription>
              这里只决定“新用户第一次出现时落到哪个角色”。显式绑定仍然在目录里逐个用户维护。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[72vh] space-y-3 overflow-y-auto p-5">
            {authorizationChannels.map((channel) => {
              const channelConfig = getChannelConfig(form, channel)
              const roleId = normalizeText(channelConfig.defaultUserRoleId) || "default"
              const role = roles.find((item) => item.roleId === roleId)
              return (
                <article
                  key={`channel-default:${channel}`}
                  className="rounded-[20px] border border-border/70 bg-secondary/28 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <ChannelBadge channel={channel} />
                      <div>
                        <div className="text-sm font-medium text-foreground">New User Default Role</div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          当前默认分组：{role?.name || resolveRoleFallbackName(roleId, roles)}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-[16rem]">
                      <select
                        className="h-11 w-full rounded-[16px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
                        value={roleId}
                        onChange={(event) => {
                          setForm((current) =>
                            updateChannelConfig(current, channel, {
                              defaultUserRoleId: event.target.value,
                            }),
                          )
                        }}
                      >
                        {roles.map((roleItem) => (
                          <option key={`${channel}:default-user:${roleItem.roleId}`} value={roleItem.roleId}>
                            {roleItem.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[16px] border border-border/60 bg-background/85 px-3 py-3">
                    <div className="text-sm font-medium text-foreground">{role?.name || roleId}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {normalizeText(role?.description) || "未填写角色说明。"}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>

          <DialogFooter className="border-t border-border/70 bg-background px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setChannelDefaultsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
