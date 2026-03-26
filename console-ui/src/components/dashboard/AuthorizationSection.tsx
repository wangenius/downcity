/**
 * Agent 授权管理主视图。
 *
 * 关键点（中文）
 * - 页面只保留最小摘要与用户目录。
 * - 策略配置收进紧凑弹窗，避免大面积留白和层级跳转。
 * - 权限说明完全来自后端目录元数据，前端只做展示。
 */

import * as React from "react"
import {
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
import { Badge, Button } from "@downcity/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@downcity/ui"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
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
type SettingsView = "roles" | "defaults"

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
      description: normalizeText(meta?.description),
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
        "inline-flex min-w-[7.5rem] items-center gap-2 rounded-full border px-3 py-1.5",
        props.tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-700"
          : "border-border/70 bg-secondary/60 text-foreground",
      )}
    >
      {props.icon ? <span className="text-muted-foreground">{props.icon}</span> : null}
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{props.label}</span>
      <span className="ml-auto text-sm font-semibold">{props.value}</span>
    </div>
  )
}

function ChannelBadge(props: { channel: AuthorizationChannel }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px]",
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
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false)
  const [settingsView, setSettingsView] = React.useState<SettingsView>("roles")
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
    setNewRoleDraft("")
  }, [newRoleDraft, roles])

  const handleDeleteRole = React.useCallback(async (role: UiChatAuthorizationRole) => {
    if (!canDeleteRole(role.roleId)) return
    const accepted = await confirm({
      title: `删除角色 ${role.name}`,
      description: "删除后会回退到 default。",
      confirmText: "删除",
      confirmVariant: "destructive",
    })
    if (!accepted) return
    setForm((current) => removeRoleFromState(current, role.roleId))
  }, [confirm])

  return (
    <section className="space-y-4">
      <DashboardModule
        title="Authorization"
        description={normalizeText(selectedAgent?.name || selectedAgent?.id || "未选择")}
        bodyClassName="space-y-2.5"
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-[10px]"
              onClick={() => void onRefresh()}
            >
              <RefreshCcwIcon className="mr-1 size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-[10px]"
              disabled={saving || !hasUnsavedChanges}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Roles" value={roles.length} icon={<ShieldCheckIcon className="size-3.5" />} />
          <StatChip label="Users" value={observedUsers.length} icon={<UsersIcon className="size-3.5" />} />
          <StatChip label="Groups" value={groupChatCount} icon={<MessagesSquareIcon className="size-3.5" />} />
          <StatChip
            label="Draft"
            value={hasUnsavedChanges ? "Pending" : "Synced"}
            tone={hasUnsavedChanges ? "default" : "success"}
            icon={<SlidersHorizontalIcon className="size-3.5" />}
          />
          <Button
            type="button"
            size="sm"
            className="ml-auto rounded-[10px]"
            onClick={() => {
              setSettingsView("roles")
              setSettingsDialogOpen(true)
            }}
          >
            <Settings2Icon className="mr-1 size-4" />
            Policy
          </Button>
        </div>
      </DashboardModule>

      <DashboardModule
        title="Directory"
        description="Users"
        bodyClassName="space-y-2.5"
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[14rem]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 rounded-[12px] bg-secondary/70 pl-9"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="search user / chat / id"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["all", ...authorizationChannels] as DirectoryChannelFilter[]).map((item) => (
              <Button
                key={`channel-filter:${item}`}
                type="button"
                size="sm"
                variant="ghost"
                className={cn("rounded-[10px]", item === channelFilter ? "bg-secondary" : "")}
                onClick={() => setChannelFilter(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>

        <Separator className="bg-border/70" />

        {filteredUsers.length === 0 ? (
          <div className="rounded-[12px] bg-secondary/40 px-3 py-5 text-sm text-muted-foreground">
            没有匹配的用户。
          </div>
        ) : (
          <div className="space-y-1.5">
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
                  className="rounded-[12px] border border-border/60 bg-secondary/25 px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {user.username || user.userId}
                        </span>
                        <ChannelBadge channel={channel} />
                        <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                          {explicitRoleId ? "custom" : "default"}
                        </Badge>
                        {hasPermission(role, "agent.manage") ? (
                          <Badge className="h-5 rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">
                            admin
                          </Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{user.userId}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {`${user.lastChatTitle || user.lastChatId || "-"} · ${user.lastChatType || "-"} · ${formatTime(user.lastSeenAt)}`}
                      </div>
                    </div>

                    <select
                      className="h-9 min-w-[10.5rem] rounded-[10px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
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
      </DashboardModule>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="w-[min(96vw,920px)] p-0">
          <DialogHeader className="border-b border-border/70 bg-secondary/35 px-4 py-3">
            <DialogTitle>Policy</DialogTitle>
            <DialogDescription className="sr-only">Authorization policy editor</DialogDescription>
          </DialogHeader>

          <Tabs
            value={settingsView}
            onValueChange={(value) => setSettingsView(value as SettingsView)}
            className="gap-0"
          >
            <div className="border-b border-border/70 px-4 py-2">
              <TabsList className="rounded-[10px] bg-secondary/70 p-0.5">
                <TabsTrigger value="roles" className="rounded-[8px] px-2.5 text-xs">
                  Roles
                </TabsTrigger>
                <TabsTrigger value="defaults" className="rounded-[8px] px-2.5 text-xs">
                  Defaults
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="roles" className="max-h-[72vh] overflow-y-auto p-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newRoleDraft}
                    onChange={(event) => setNewRoleDraft(event.target.value)}
                    placeholder="new role id"
                    className="h-9 rounded-[12px] bg-secondary/70"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-[10px] px-3"
                    onClick={handleCreateRole}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </div>

                <TooltipProvider>
                  <div className="space-y-2">
                    {roles.map((role) => {
                      const assignment = countRoleAssignments({
                        roleId: role.roleId,
                        channels: form.channels,
                        authorizationChannels,
                        users: observedUsers,
                      })
                      return (
                        <article
                          key={`role-card:${role.roleId}`}
                          className="rounded-[12px] border border-border/70 bg-background/85 px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              value={role.name}
                              className="h-8 min-w-[10rem] flex-1 rounded-[10px] bg-secondary/60"
                              onChange={(event) => {
                                const value = event.target.value
                                setForm((current) => ({
                                  ...current,
                                  roles: {
                                    ...current.roles,
                                    [role.roleId]: {
                                      ...(current.roles[role.roleId] || role),
                                      name: value,
                                    },
                                  },
                                }))
                              }}
                            />
                            <Badge variant="outline" className="bg-background/90 font-mono text-[10px]">
                              {role.roleId}
                            </Badge>
                            <Badge variant="secondary" className="bg-secondary text-[10px] text-muted-foreground">
                              {`${assignment.users}/${assignment.defaults}`}
                            </Badge>
                            {PROTECTED_ROLE_IDS.has(role.roleId) ? (
                              <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">
                                reserved
                              </Badge>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="ml-auto rounded-[8px] px-2 text-destructive hover:bg-destructive/8 hover:text-destructive"
                              disabled={!canDeleteRole(role.roleId)}
                              onClick={() => void handleDeleteRole(role)}
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </div>

                          <div className="mt-2">
                            <Input
                              value={role.description || ""}
                              className="h-8 rounded-[10px] bg-secondary/60"
                              onChange={(event) => {
                                const value = event.target.value
                                setForm((current) => ({
                                  ...current,
                                  roles: {
                                    ...current.roles,
                                    [role.roleId]: {
                                      ...(current.roles[role.roleId] || role),
                                      description: value,
                                    },
                                  },
                                }))
                              }}
                              placeholder="description"
                            />
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {permissionCatalog.map((permission) => {
                              const enabled = hasPermission(role, permission.permission)
                              return (
                                <Tooltip key={`${role.roleId}:${permission.permission}`}>
                                  <TooltipTrigger
                                    render={
                                      <button
                                        type="button"
                                        className={cn(
                                          "inline-flex h-7 items-center rounded-[9px] border px-2 text-[11px] font-medium transition",
                                          enabled
                                            ? "border-foreground/10 bg-foreground text-background"
                                            : "border-border/70 bg-background text-muted-foreground hover:bg-secondary/45 hover:text-foreground",
                                        )}
                                        onClick={() => {
                                          setForm((current) => {
                                            const currentRole = current.roles[role.roleId] || role
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
                                                [role.roleId]: {
                                                  ...currentRole,
                                                  permissions: [...permissions] as AuthorizationPermission[],
                                                },
                                              },
                                            }
                                          })
                                        }}
                                      >
                                        {permission.name}
                                      </button>
                                    }
                                  />
                                  {permission.description ? (
                                    <TooltipContent>{permission.description}</TooltipContent>
                                  ) : null}
                                </Tooltip>
                              )
                            })}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </TooltipProvider>
              </div>
            </TabsContent>

            <TabsContent value="defaults" className="max-h-[72vh] overflow-y-auto p-4">
              <div className="space-y-1.5">
                {authorizationChannels.map((channel) => {
                  const channelConfig = getChannelConfig(form, channel)
                  const roleId = normalizeText(channelConfig.defaultUserRoleId) || "default"
                  const role = roles.find((item) => item.roleId === roleId)
                  return (
                    <article
                      key={`channel-default:${channel}`}
                      className="rounded-[12px] border border-border/70 bg-secondary/28 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ChannelBadge channel={channel} />
                          <div className="text-sm font-medium text-foreground">
                            {role?.name || resolveRoleFallbackName(roleId, roles)}
                          </div>
                        </div>

                        <select
                          className="h-8 min-w-[12rem] rounded-[10px] border border-transparent bg-background/90 px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/30"
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
                    </article>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="border-t border-border/70 bg-background px-4 py-3">
            <Button type="button" variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
