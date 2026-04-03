/**
 * Console UI Access 工作台 API。
 *
 * 关键点（中文）
 * - 只面向当前管理员自己，不再提供多用户管理请求。
 * - Access 页所有请求统一从这里发起，避免散落在 hook 中。
 */

import { dashboardApiRoutes } from "./dashboard-api"
import type {
  UiAuthAccessIssuedToken,
  UiAuthAccessMeResponse,
  UiAuthAccessTokenListResponse,
  UiAuthAccessTokenSummary,
  UiAuthAccessUser,
} from "@/types/AuthAccess"

type RequestJson = <T>(
  path: string,
  options?: RequestInit,
  preferredAgentId?: string,
) => Promise<T>

/**
 * 读取当前管理员摘要。
 */
export async function queryAuthAccessMe(
  requestJson: RequestJson,
): Promise<UiAuthAccessMeResponse> {
  return requestJson<UiAuthAccessMeResponse>(dashboardApiRoutes.authMe())
}

/**
 * 读取当前管理员 token 列表。
 */
export async function queryAuthAccessTokens(
  requestJson: RequestJson,
): Promise<UiAuthAccessTokenListResponse> {
  return requestJson<UiAuthAccessTokenListResponse>(dashboardApiRoutes.authTokenList())
}

/**
 * 为当前管理员签发新 token。
 */
export async function createAuthAccessToken(params: {
  requestJson: RequestJson
  input: {
    name: string
    expiresAt?: string
  }
}): Promise<UiAuthAccessIssuedToken> {
  const data = await params.requestJson<{ token: UiAuthAccessIssuedToken }>(
    dashboardApiRoutes.authTokenCreate(),
    {
      method: "POST",
      body: JSON.stringify(params.input),
    },
  )
  return data.token
}

/**
 * 吊销当前管理员 token。
 */
export async function revokeAuthAccessToken(params: {
  requestJson: RequestJson
  tokenId: string
}): Promise<UiAuthAccessTokenSummary> {
  const data = await params.requestJson<{ token: UiAuthAccessTokenSummary }>(
    dashboardApiRoutes.authTokenRevoke(),
    {
      method: "POST",
      body: JSON.stringify({
        tokenId: params.tokenId,
      }),
    },
  )
  return data.token
}

/**
 * 删除当前管理员 token。
 */
export async function deleteAuthAccessToken(params: {
  requestJson: RequestJson
  tokenId: string
}): Promise<void> {
  await params.requestJson<{ success: boolean }>(
    dashboardApiRoutes.authTokenDelete(),
    {
      method: "POST",
      body: JSON.stringify({
        tokenId: params.tokenId,
      }),
    },
  )
}

/**
 * 修改当前管理员密码。
 */
export async function updateAuthAccessPassword(params: {
  requestJson: RequestJson
  input: {
    currentPassword: string
    nextPassword: string
  }
}): Promise<UiAuthAccessUser> {
  const data = await params.requestJson<{ user: UiAuthAccessUser }>(
    dashboardApiRoutes.authPasswordUpdate(),
    {
      method: "POST",
      body: JSON.stringify(params.input),
    },
  )
  return data.user
}
