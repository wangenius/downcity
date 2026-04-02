/**
 * Console UI 统一账户管理 Hook。
 *
 * 关键点（中文）
 * - 独立管理多用户与 token 管理页状态，避免继续挤压 `useConsoleDashboard`。
 * - 只依赖外部注入的 `requestJson` 与 toast 能力，不直接耦合 dashboard 其他状态。
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createAuthAdminUser,
  createAuthAdminUserToken,
  queryAuthAdminUsers,
  queryAuthAdminUserTokens,
  revokeAuthAdminUserToken,
  setAuthAdminUserRoles,
  updateAuthAdminUser,
} from "@/lib/auth-admin-api"
import { getErrorMessage } from "./shared"
import type {
  UiAuthAdminIssuedToken,
  UiAuthAdminRoleCatalogItem,
  UiAuthAdminTokenSummary,
  UiAuthAdminUserSummary,
} from "@/types/AuthAdmin"
import type { DashboardToastType } from "@/types/DashboardHook"

type RequestJson = <T>(
  path: string,
  options?: RequestInit,
  preferredAgentId?: string,
) => Promise<T>

export interface UseDashboardAccessResult {
  /**
   * 当前角色目录。
   */
  accessRoles: UiAuthAdminRoleCatalogItem[]

  /**
   * 当前用户列表。
   */
  accessUsers: UiAuthAdminUserSummary[]

  /**
   * 当前选中的用户 ID。
   */
  selectedAccessUserId: string

  /**
   * 当前选中的用户摘要。
   */
  selectedAccessUser: UiAuthAdminUserSummary | null

  /**
   * 当前选中用户的 token 列表。
   */
  accessTokens: UiAuthAdminTokenSummary[]

  /**
   * 当前是否正在读取用户目录。
   */
  accessLoading: boolean

  /**
   * 当前是否正在读取 token 列表。
   */
  accessTokensLoading: boolean

  /**
   * 最近一次新签发的明文 token。
   */
  latestIssuedAccessToken: UiAuthAdminIssuedToken | null

  /**
   * 清空最近一次新签发的明文 token。
   */
  clearLatestIssuedAccessToken: () => void

  /**
   * 手动切换当前选中的用户。
   */
  selectAccessUser: (userId: string) => Promise<void>

  /**
   * 刷新用户目录。
   */
  refreshAccessUsers: (preferredUserId?: string) => Promise<void>

  /**
   * 创建新用户。
   */
  createAccessUser: (input: {
    username: string
    password: string
    displayName?: string
    roleName: string
  }) => Promise<void>

  /**
   * 更新用户状态或展示名。
   */
  updateAccessUser: (input: {
    userId: string
    displayName?: string
    status: "active" | "disabled"
  }) => Promise<void>

  /**
   * 更新用户角色。
   */
  setAccessUserRole: (input: {
    userId: string
    roleName: string
  }) => Promise<void>

  /**
   * 为目标用户签发新 token。
   */
  createAccessUserToken: (input: {
    userId: string
    name: string
    expiresAt?: string
  }) => Promise<void>

  /**
   * 吊销目标用户 token。
   */
  revokeAccessUserToken: (input: {
    userId: string
    tokenId: string
  }) => Promise<void>
}

export function useDashboardAccess(params: {
  enabled: boolean
  requestJson: RequestJson
  showToast: (message: string, type?: DashboardToastType) => void
}): UseDashboardAccessResult {
  const { enabled, requestJson, showToast } = params
  const [accessRoles, setAccessRoles] = useState<UiAuthAdminRoleCatalogItem[]>([])
  const [accessUsers, setAccessUsers] = useState<UiAuthAdminUserSummary[]>([])
  const [selectedAccessUserId, setSelectedAccessUserId] = useState("")
  const [accessTokens, setAccessTokens] = useState<UiAuthAdminTokenSummary[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessTokensLoading, setAccessTokensLoading] = useState(false)
  const [latestIssuedAccessToken, setLatestIssuedAccessToken] = useState<UiAuthAdminIssuedToken | null>(null)

  const selectedAccessUser = useMemo(
    () => accessUsers.find((item) => item.id === selectedAccessUserId) || null,
    [accessUsers, selectedAccessUserId],
  )

  const refreshAccessTokens = useCallback(async (userId: string) => {
    const normalizedUserId = String(userId || "").trim()
    if (!enabled || !normalizedUserId) {
      setAccessTokens([])
      return
    }
    setAccessTokensLoading(true)
    try {
      const payload = await queryAuthAdminUserTokens(requestJson, normalizedUserId)
      setAccessTokens(Array.isArray(payload.tokens) ? payload.tokens : [])
    } finally {
      setAccessTokensLoading(false)
    }
  }, [enabled, requestJson])

  const refreshAccessUsers = useCallback(async (preferredUserId?: string) => {
    if (!enabled) {
      setAccessRoles([])
      setAccessUsers([])
      setSelectedAccessUserId("")
      setAccessTokens([])
      return
    }
    setAccessLoading(true)
    try {
      const payload = await queryAuthAdminUsers(requestJson)
      const roles = Array.isArray(payload.roles) ? payload.roles : []
      const users = Array.isArray(payload.users) ? payload.users : []
      const normalizedPreferredUserId = String(preferredUserId || "").trim()
      const nextSelectedUserId =
        users.find((item) => item.id === normalizedPreferredUserId)?.id ||
        users.find((item) => item.id === selectedAccessUserId)?.id ||
        users[0]?.id ||
        ""

      setAccessRoles(roles)
      setAccessUsers(users)
      setSelectedAccessUserId(nextSelectedUserId)
      await refreshAccessTokens(nextSelectedUserId)
    } finally {
      setAccessLoading(false)
    }
  }, [enabled, refreshAccessTokens, requestJson, selectedAccessUserId])

  const selectAccessUser = useCallback(async (userId: string) => {
    const normalizedUserId = String(userId || "").trim()
    setSelectedAccessUserId(normalizedUserId)
    await refreshAccessTokens(normalizedUserId)
  }, [refreshAccessTokens])

  const createAccessUser = useCallback(async (input: {
    username: string
    password: string
    displayName?: string
    roleName: string
  }) => {
    const user = await createAuthAdminUser({
      requestJson,
      input: {
        username: input.username,
        password: input.password,
        displayName: input.displayName,
        roleNames: [input.roleName],
      },
    })
    showToast(`已创建用户 ${user.username}`, "success")
    setLatestIssuedAccessToken(null)
    await refreshAccessUsers(user.id)
  }, [refreshAccessUsers, requestJson, showToast])

  const updateAccessUser = useCallback(async (input: {
    userId: string
    displayName?: string
    status: "active" | "disabled"
  }) => {
    const user = await updateAuthAdminUser({
      requestJson,
      userId: input.userId,
      input: {
        displayName: input.displayName,
        status: input.status,
      },
    })
    showToast(`已更新用户 ${user.username}`, "success")
    await refreshAccessUsers(user.id)
  }, [refreshAccessUsers, requestJson, showToast])

  const setAccessUserRole = useCallback(async (input: {
    userId: string
    roleName: string
  }) => {
    const user = await setAuthAdminUserRoles({
      requestJson,
      userId: input.userId,
      roleNames: [input.roleName],
    })
    showToast(`已更新 ${user.username} 的角色`, "success")
    await refreshAccessUsers(user.id)
  }, [refreshAccessUsers, requestJson, showToast])

  const createAccessUserToken = useCallback(async (input: {
    userId: string
    name: string
    expiresAt?: string
  }) => {
    const payload = await createAuthAdminUserToken({
      requestJson,
      userId: input.userId,
      input: {
        name: input.name,
        expiresAt: input.expiresAt,
      },
    })
    setLatestIssuedAccessToken(payload.token)
    showToast(`已为 ${payload.user.username} 签发 token`, "success")
    await refreshAccessTokens(payload.user.id)
  }, [refreshAccessTokens, requestJson, showToast])

  const revokeAccessUserToken = useCallback(async (input: {
    userId: string
    tokenId: string
  }) => {
    await revokeAuthAdminUserToken({
      requestJson,
      userId: input.userId,
      tokenId: input.tokenId,
    })
    showToast("已吊销 token", "success")
    await refreshAccessTokens(input.userId)
  }, [refreshAccessTokens, requestJson, showToast])

  const clearLatestIssuedAccessToken = useCallback(() => {
    setLatestIssuedAccessToken(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setAccessRoles([])
      setAccessUsers([])
      setSelectedAccessUserId("")
      setAccessTokens([])
      setLatestIssuedAccessToken(null)
      return
    }
    void refreshAccessUsers().catch((error) => {
      showToast(getErrorMessage(error), "error")
    })
  }, [enabled, refreshAccessUsers, showToast])

  return {
    accessRoles,
    accessUsers,
    selectedAccessUserId,
    selectedAccessUser,
    accessTokens,
    accessLoading,
    accessTokensLoading,
    latestIssuedAccessToken,
    clearLatestIssuedAccessToken,
    selectAccessUser,
    refreshAccessUsers,
    createAccessUser,
    updateAccessUser,
    setAccessUserRole,
    createAccessUserToken,
    revokeAccessUserToken,
  }
}
