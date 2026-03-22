/**
 * Agent 授权管理主视图。
 *
 * 关键点（中文）
 * - 参考 openclaw 的授权心智模型：区分 owner、DM policy、group policy、pairing。
 * - 以“先看待审批，再管配置，再看观测对象”的顺序组织，方便运维排障。
 */

import * as React from "react"
import { CheckIcon, RefreshCcwIcon, ShieldCheckIcon, ShieldOffIcon, UserCheckIcon, UserMinusIcon, XIcon } from "lucide-react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Button } from "@/components/ui/button"
import type {
  UiAgentOption,
  UiChatAuthorizationChannelConfig,
  UiChatAuthorizationChat,
  UiChatAuthorizationResponse,
  UiChatAuthorizationUser,
} from "@/types/Dashboard"

type AuthorizationChannel = "telegram" | "feishu" | "qq"
type AuthorizationDmPolicy = "open" | "pairing" | "allowlist" | "disabled"
type AuthorizationGroupPolicy = "open" | "allowlist" | "disabled"

type AuthorizationFormState = {
  channels: Partial<Record<AuthorizationChannel, UiChatAuthorizationChannelConfig>>
}

type AuthorizationActionInput = {
  action:
    | "approvePairing"
    | "rejectPairing"
    | "grantUser"
    | "revokeUser"
    | "setOwner"
    | "grantGroup"
    | "revokeGroup"
  channel: AuthorizationChannel
  userId?: string
  chatId?: string
  enabled?: boolean
  asOwner?: boolean
}

const AUTHORIZATION_CHANNELS: AuthorizationChannel[] = ["telegram", "feishu", "qq"]
const DM_POLICIES: AuthorizationDmPolicy[] = ["open", "pairing", "allowlist", "disabled"]
const GROUP_POLICIES: AuthorizationGroupPolicy[] = ["open", "allowlist", "disabled"]

function cloneConfig(
  input: UiChatAuthorizationResponse["config"],
): AuthorizationFormState {
  return {
    channels: JSON.parse(JSON.stringify(input?.channels || {})) as AuthorizationFormState["channels"],
  }
}

function normalizeStringList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
}

function listToMultilineText(values: string[] | undefined): string {
  return normalizeStringList(values).join("\n")
}

function multilineTextToList(value: string): string[] {
  return normalizeStringList(value.split(/\r?\n/g))
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
    channels: {
      ...state.channels,
      [channel]: {
        ...getChannelConfig(state, channel),
        ...patch,
      },
    },
  }
}

function renderPolicyButtonClass(active: boolean): string {
  return active
    ? "h-8 rounded-[11px] bg-foreground text-background hover:bg-foreground/90"
    : "h-8 rounded-[11px] bg-secondary text-foreground hover:bg-secondary/80"
}

function getUserFlags(
  user: UiChatAuthorizationUser,
  channelConfig: UiChatAuthorizationChannelConfig | undefined,
): { isOwner: boolean; isAllowed: boolean } {
  const ownerIds = normalizeStringList(channelConfig?.ownerIds)
  const allowFrom = normalizeStringList(channelConfig?.allowFrom)
  return {
    isOwner: ownerIds.includes(String(user.userId || "").trim()),
    isAllowed: allowFrom.includes(String(user.userId || "").trim()),
  }
}

function isGroupChat(chat: UiChatAuthorizationChat): boolean {
  const type = String(chat.chatType || "").trim().toLowerCase()
  return type !== "" && type !== "private" && type !== "p2p"
}

export interface AuthorizationSectionProps {
  /**
   * 当前 agent 的授权快照。
   */
  authorization: UiChatAuthorizationResponse | null
  /**
   * 当前是否处于 dashboard 刷新中。
   */
  loading: boolean
  /**
   * 当前选中的 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * 时间格式化函数。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 刷新授权快照。
   */
  onRefresh: () => Promise<void>
  /**
   * 保存授权配置。
   */
  onSaveConfig: (config: NonNullable<UiChatAuthorizationResponse["config"]>) => Promise<void>
  /**
   * 执行授权动作。
   */
  onRunAction: (input: AuthorizationActionInput) => Promise<void>
}

export function AuthorizationSection(props: AuthorizationSectionProps) {
  const { authorization, loading, selectedAgent, formatTime, onRefresh, onSaveConfig, onRunAction } = props
  const [form, setForm] = React.useState<AuthorizationFormState>(() => cloneConfig(undefined))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setForm(cloneConfig(authorization?.config))
  }, [authorization?.config])

  const observedUsers = React.useMemo(
    () => Array.isArray(authorization?.users) ? authorization.users : [],
    [authorization?.users],
  )
  const observedChats = React.useMemo(
    () => Array.isArray(authorization?.chats) ? authorization.chats : [],
    [authorization?.chats],
  )
  const pairingRequests = React.useMemo(
    () => Array.isArray(authorization?.pairingRequests) ? authorization.pairingRequests : [],
    [authorization?.pairingRequests],
  )

  const handleSave = React.useCallback(async () => {
    try {
      setSaving(true)
      await onSaveConfig({
        channels: AUTHORIZATION_CHANNELS.reduce((result, channel) => {
          const current = getChannelConfig(form, channel)
          result[channel] = {
            ownerIds: normalizeStringList(current.ownerIds),
            dmPolicy: (String(current.dmPolicy || "pairing").trim().toLowerCase() || "pairing") as AuthorizationDmPolicy,
            allowFrom: normalizeStringList(current.allowFrom),
            groupPolicy: (String(current.groupPolicy || "allowlist").trim().toLowerCase() || "allowlist") as AuthorizationGroupPolicy,
            groupAllowFrom: normalizeStringList(current.groupAllowFrom),
          }
          return result
        }, {} as NonNullable<UiChatAuthorizationResponse["config"]>["channels"]),
      })
    } finally {
      setSaving(false)
    }
  }, [form, onSaveConfig])

  return (
    <section className="space-y-5">
      <DashboardModule
        title="Authorization"
        description={`当前 agent：${String(selectedAgent?.name || selectedAgent?.id || "未选择").trim() || "未选择"}。owner 决定 is_master，高权限用户不再依赖单个 authId。`}
        actions={(
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
              disabled={saving}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          </>
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`pairing ${pairingRequests.length}`}
          </span>
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`users ${observedUsers.length}`}
          </span>
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`chats ${observedChats.length}`}
          </span>
          {loading ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">syncing</span> : null}
        </div>
      </DashboardModule>

      <DashboardModule
        title="Pairing Requests"
        description="未授权私聊用户会先进入待审批队列。审批通过后自动加入 DM allowlist。"
      >
        {pairingRequests.length === 0 ? (
          <div className="rounded-[16px] bg-secondary px-4 py-4 text-sm text-muted-foreground">当前没有待审批请求</div>
        ) : (
          <div className="space-y-2">
            {pairingRequests.map((item) => {
              const channel = String(item.channel || "").trim().toLowerCase() as AuthorizationChannel
              return (
                <article key={`${item.channel}:${item.userId}`} className="rounded-[18px] bg-secondary/55 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{item.username || item.userId}</span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          {item.channel}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{item.userId}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {`${item.chatTitle || item.chatId || "-"} · ${item.chatType || "private"} · updated ${formatTime(item.updatedAt)}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-[11px]"
                        onClick={() => void onRunAction({ action: "approvePairing", channel, userId: item.userId })}
                      >
                        <CheckIcon className="mr-1.5 size-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-[11px]"
                        onClick={() => void onRunAction({ action: "approvePairing", channel, userId: item.userId, asOwner: true })}
                      >
                        <ShieldCheckIcon className="mr-1.5 size-4" />
                        Make Owner
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-[11px]"
                        onClick={() => void onRunAction({ action: "rejectPairing", channel, userId: item.userId })}
                      >
                        <XIcon className="mr-1.5 size-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <DashboardModule
        title="Channel Policies"
        description="每个 agent 都有独立授权配置。这里直接写入 console ship.db 的 agent 级加密配置。"
      >
        <div className="space-y-4">
          {AUTHORIZATION_CHANNELS.map((channel) => {
            const config = getChannelConfig(form, channel)
            const ownerCount = normalizeStringList(config.ownerIds).length
            const userCount = normalizeStringList(config.allowFrom).length
            const groupCount = normalizeStringList(config.groupAllowFrom).length
            return (
              <article key={channel} className="rounded-[20px] bg-secondary/40 px-4 py-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.1em] text-foreground">{channel}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{`owner ${ownerCount}`}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{`dm allow ${userCount}`}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{`group allow ${groupCount}`}</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">DM Policy</div>
                    <div className="flex flex-wrap gap-2">
                      {DM_POLICIES.map((policy) => (
                        <Button
                          key={`${channel}:dm:${policy}`}
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={renderPolicyButtonClass(String(config.dmPolicy || "pairing") === policy)}
                          onClick={() => {
                            setForm((current) => updateChannelConfig(current, channel, { dmPolicy: policy }))
                          }}
                        >
                          {policy}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Group Policy</div>
                    <div className="flex flex-wrap gap-2">
                      {GROUP_POLICIES.map((policy) => (
                        <Button
                          key={`${channel}:group:${policy}`}
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={renderPolicyButtonClass(String(config.groupPolicy || "allowlist") === policy)}
                          onClick={() => {
                            setForm((current) => updateChannelConfig(current, channel, { groupPolicy: policy }))
                          }}
                        >
                          {policy}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Owner IDs</div>
                      <textarea
                        className="min-h-32 w-full rounded-[16px] border border-border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground"
                        value={listToMultilineText(config.ownerIds)}
                        onChange={(event) => {
                          setForm((current) => updateChannelConfig(current, channel, {
                            ownerIds: multilineTextToList(event.target.value),
                          }))
                        }}
                        placeholder="one user id per line"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">DM Allowlist</div>
                      <textarea
                        className="min-h-32 w-full rounded-[16px] border border-border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground"
                        value={listToMultilineText(config.allowFrom)}
                        onChange={(event) => {
                          setForm((current) => updateChannelConfig(current, channel, {
                            allowFrom: multilineTextToList(event.target.value),
                          }))
                        }}
                        placeholder="one user id per line"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Group Allowlist</div>
                      <textarea
                        className="min-h-32 w-full rounded-[16px] border border-border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground"
                        value={listToMultilineText(config.groupAllowFrom)}
                        onChange={(event) => {
                          setForm((current) => updateChannelConfig(current, channel, {
                            groupAllowFrom: multilineTextToList(event.target.value),
                          }))
                        }}
                        placeholder="one chat id per line"
                      />
                    </label>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </DashboardModule>

      <DashboardModule
        title="Observed Users"
        description="这里是运行时观测到的用户快照。owner / allowlist 状态直接按当前 ship.json 配置叠加显示。"
      >
        {observedUsers.length === 0 ? (
          <div className="rounded-[16px] bg-secondary px-4 py-4 text-sm text-muted-foreground">还没有观测到 chat 用户</div>
        ) : (
          <div className="space-y-2">
            {observedUsers.map((user) => {
              const channel = String(user.channel || "").trim().toLowerCase() as AuthorizationChannel
              const flags = getUserFlags(user, authorization?.config?.channels?.[channel])
              return (
                <article key={`${user.channel}:${user.userId}`} className="rounded-[18px] bg-secondary/55 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{user.username || user.userId}</span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          {user.channel}
                        </span>
                        {flags.isOwner ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] text-emerald-700">owner</span> : null}
                        {flags.isAllowed ? <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">allowed</span> : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{user.userId}</div>
                      <div className="text-xs text-muted-foreground">
                        {`${user.lastChatTitle || user.lastChatId || "-"} · ${user.lastChatType || "-"} · seen ${formatTime(user.lastSeenAt)}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-[11px]"
                        onClick={() => void onRunAction({ action: flags.isAllowed ? "revokeUser" : "grantUser", channel, userId: user.userId })}
                      >
                        {flags.isAllowed ? <UserMinusIcon className="mr-1.5 size-4" /> : <UserCheckIcon className="mr-1.5 size-4" />}
                        {flags.isAllowed ? "Revoke" : "Grant"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-[11px]"
                        onClick={() => void onRunAction({ action: "setOwner", channel, userId: user.userId, enabled: !flags.isOwner })}
                      >
                        {flags.isOwner ? <ShieldOffIcon className="mr-1.5 size-4" /> : <ShieldCheckIcon className="mr-1.5 size-4" />}
                        {flags.isOwner ? "Unset Owner" : "Set Owner"}
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <DashboardModule
        title="Observed Chats"
        description="群聊 / 频道授权管理。仅展示非私聊会话，方便直接维护 group allowlist。"
      >
        {observedChats.filter(isGroupChat).length === 0 ? (
          <div className="rounded-[16px] bg-secondary px-4 py-4 text-sm text-muted-foreground">还没有观测到群聊或频道</div>
        ) : (
          <div className="space-y-2">
            {observedChats.filter(isGroupChat).map((chat) => {
              const channel = String(chat.channel || "").trim().toLowerCase() as AuthorizationChannel
              const allowed = normalizeStringList(authorization?.config?.channels?.[channel]?.groupAllowFrom).includes(
                String(chat.chatId || "").trim(),
              )
              return (
                <article key={`${chat.channel}:${chat.chatId}`} className="rounded-[18px] bg-secondary/55 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{chat.chatTitle || chat.chatId}</span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          {chat.channel}
                        </span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          {chat.chatType || "group"}
                        </span>
                        {allowed ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] text-emerald-700">allowed</span> : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{chat.chatId}</div>
                      <div className="text-xs text-muted-foreground">
                        {`last actor ${chat.lastActorName || chat.lastActorId || "-"} · seen ${formatTime(chat.lastSeenAt)}`}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-[11px]"
                      onClick={() => void onRunAction({
                        action: allowed ? "revokeGroup" : "grantGroup",
                        channel,
                        chatId: chat.chatId,
                      })}
                    >
                      {allowed ? "Revoke Group" : "Grant Group"}
                    </Button>
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
