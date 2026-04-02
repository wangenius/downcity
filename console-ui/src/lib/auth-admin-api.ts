/**
 * Console UI 统一账户管理 API。
 *
 * 关键点（中文）
 * - 把多用户与 token 管理请求集中在单独模块。
 * - 避免继续把这类全局管理能力塞进通用 dashboard 查询文件。
 */

import { dashboardApiRoutes } from "./dashboard-api"
import type {
  UiAuthAdminIssuedUserTokenResponse,
  UiAuthAdminTokenSummary,
  UiAuthAdminUserSummary,
  UiAuthAdminUserTokensResponse,
  UiAuthAdminUsersResponse,
} from "@/types/AuthAdmin"

type RequestJson = <T>(
  path: string,
  options?: RequestInit,
  preferredAgentId?: string,
) => Promise<T>

/**
 * 读取统一账户用户目录。
 */
export async function queryAuthAdminUsers(
  requestJson: RequestJson,
): Promise<UiAuthAdminUsersResponse> {
  return requestJson<UiAuthAdminUsersResponse>(dashboardApiRoutes.authAdminUsers())
}

/**
 * 读取单个用户的 token 列表。
 */
export async function queryAuthAdminUserTokens(
  requestJson: RequestJson,
  userId: string,
): Promise<UiAuthAdminUserTokensResponse> {
  return requestJson<UiAuthAdminUserTokensResponse>(
    dashboardApiRoutes.authAdminUserTokens(userId),
  )
}

/**
 * 创建新的统一账户用户。
 */
export async function createAuthAdminUser(params: {
  requestJson: RequestJson
  input: {
    username: string
    password: string
    displayName?: string
    roleNames: string[]
  }
}): Promise<UiAuthAdminUserSummary> {
  const data = await params.requestJson<{ user: UiAuthAdminUserSummary }>(
    dashboardApiRoutes.authAdminCreateUser(),
    {
      method: "POST",
      body: JSON.stringify(params.input),
    },
  )
  return data.user
}

/**
 * 更新用户展示信息或状态。
 */
export async function updateAuthAdminUser(params: {
  requestJson: RequestJson
  userId: string
  input: {
    displayName?: string
    status: "active" | "disabled"
  }
}): Promise<UiAuthAdminUserSummary> {
  const data = await params.requestJson<{ user: UiAuthAdminUserSummary }>(
    dashboardApiRoutes.authAdminUpdateUser(params.userId),
    {
      method: "POST",
      body: JSON.stringify(params.input),
    },
  )
  return data.user
}

/**
 * 覆盖用户角色集合。
 */
export async function setAuthAdminUserRoles(params: {
  requestJson: RequestJson
  userId: string
  roleNames: string[]
}): Promise<UiAuthAdminUserSummary> {
  const data = await params.requestJson<{ user: UiAuthAdminUserSummary }>(
    dashboardApiRoutes.authAdminSetUserRoles(params.userId),
    {
      method: "POST",
      body: JSON.stringify({
        roleNames: params.roleNames,
      }),
    },
  )
  return data.user
}

/**
 * 为指定用户签发新 token。
 */
export async function createAuthAdminUserToken(params: {
  requestJson: RequestJson
  userId: string
  input: {
    name: string
    expiresAt?: string
  }
}): Promise<UiAuthAdminIssuedUserTokenResponse> {
  return params.requestJson<UiAuthAdminIssuedUserTokenResponse>(
    dashboardApiRoutes.authAdminCreateUserToken(params.userId),
    {
      method: "POST",
      body: JSON.stringify(params.input),
    },
  )
}

/**
 * 吊销指定用户的 token。
 */
export async function revokeAuthAdminUserToken(params: {
  requestJson: RequestJson
  userId: string
  tokenId: string
}): Promise<UiAuthAdminTokenSummary> {
  const data = await params.requestJson<{ token: UiAuthAdminTokenSummary }>(
    dashboardApiRoutes.authAdminRevokeUserToken(params.userId),
    {
      method: "POST",
      body: JSON.stringify({
        tokenId: params.tokenId,
      }),
    },
  )
  return data.token
}
