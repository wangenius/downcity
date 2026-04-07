/**
 * Console UI Access 工作台 Hook。
 *
 * 关键点（中文）
 * - 当前模型只服务本机 token 主体，不再维护用户名密码登录流。
 * - Access 页只负责查看当前主体与管理 token。
 */

import { useCallback, useEffect, useState } from "react"
import {
  createAuthAccessToken,
  queryAuthAccessMe,
  queryAuthAccessTokens,
  deleteAuthAccessToken,
} from "@/lib/auth-access-api"
import { getErrorMessage } from "./shared"
import type {
  UiAuthAccessIssuedToken,
  UiAuthAccessTokenSummary,
  UiAuthAccessUser,
} from "@/types/AuthAccess"
import type { DashboardToastType } from "@/types/DashboardHook"

type RequestJson = <T>(
  path: string,
  options?: RequestInit,
  preferredAgentId?: string,
) => Promise<T>

export interface UseDashboardAccessResult {
  /**
   * 当前主体摘要。
   */
  accessUser: UiAuthAccessUser | null

  /**
   * 当前主体 token 列表。
   */
  accessTokens: UiAuthAccessTokenSummary[]

  /**
   * 当前是否正在刷新 Access 数据。
   */
  accessLoading: boolean

  /**
   * 最近一次新签发的明文 token。
   */
  latestIssuedAccessToken: UiAuthAccessIssuedToken | null

  /**
   * 清空最近一次新签发的明文 token。
   */
  clearLatestIssuedAccessToken: () => void

  /**
   * 刷新当前主体与 token 状态。
   */
  refreshAccess: () => Promise<void>

  /**
   * 签发新 token。
   */
  createAccessToken: (input: {
    name: string
    expiresAt?: string
  }) => Promise<void>

  /**
   * 删除 token。
   */
  deleteAccessToken: (input: {
    tokenId: string
  }) => Promise<void>
}

export function useDashboardAccess(params: {
  enabled: boolean
  requestJson: RequestJson
  showToast: (message: string, type?: DashboardToastType) => void
}): UseDashboardAccessResult {
  const { enabled, requestJson, showToast } = params
  const [accessUser, setAccessUser] = useState<UiAuthAccessUser | null>(null)
  const [accessTokens, setAccessTokens] = useState<UiAuthAccessTokenSummary[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [latestIssuedAccessToken, setLatestIssuedAccessToken] = useState<UiAuthAccessIssuedToken | null>(null)

  const refreshAccess = useCallback(async () => {
    if (!enabled) {
      setAccessUser(null)
      setAccessTokens([])
      return
    }
    setAccessLoading(true)
    try {
      const [mePayload, tokenPayload] = await Promise.all([
        queryAuthAccessMe(requestJson),
        queryAuthAccessTokens(requestJson),
      ])
      setAccessUser(mePayload.user || null)
      setAccessTokens(Array.isArray(tokenPayload.tokens) ? tokenPayload.tokens : [])
    } finally {
      setAccessLoading(false)
    }
  }, [enabled, requestJson])

  const createAccessToken = useCallback(async (input: {
    name: string
    expiresAt?: string
  }) => {
    const token = await createAuthAccessToken({
      requestJson,
      input,
    })
    setLatestIssuedAccessToken(token)
    showToast(`已签发 token ${token.name}`, "success")
    await refreshAccess()
  }, [refreshAccess, requestJson, showToast])

  const deleteAccessToken = useCallback(async (input: {
    tokenId: string
  }) => {
    await deleteAuthAccessToken({
      requestJson,
      tokenId: input.tokenId,
    })
    showToast("已删除 token", "success")
    await refreshAccess()
  }, [refreshAccess, requestJson, showToast])

  const clearLatestIssuedAccessToken = useCallback(() => {
    setLatestIssuedAccessToken(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setAccessUser(null)
      setAccessTokens([])
      setLatestIssuedAccessToken(null)
      return
    }
    void refreshAccess().catch((error) => {
      showToast(getErrorMessage(error), "error")
    })
  }, [enabled, refreshAccess, showToast])

  return {
    accessUser,
    accessTokens,
    accessLoading,
    latestIssuedAccessToken,
    clearLatestIssuedAccessToken,
    refreshAccess,
    createAccessToken,
    deleteAccessToken,
  }
}
