/**
 * Console UI auth 请求层回归测试。
 *
 * 关键点（中文）
 * - 当 console-ui 接入统一账户后，请求层必须自动注入 Bearer Token。
 * - 401 需要被识别成单独的未登录状态，而不是普通请求失败。
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const dashboardApiPath = path.resolve(import.meta.dirname, "../src/lib/dashboard-api.ts")
const dashboardSharedPath = path.resolve(import.meta.dirname, "../src/hooks/dashboard/shared.ts")

test("dashboard api request layer should inject bearer token from console auth storage", () => {
  const source = fs.readFileSync(dashboardApiPath, "utf-8")

  assert.match(source, /readConsoleAuthState/)
  assert.match(source, /Authorization:\s*`Bearer \$\{authState\.token\}`/)
})

test("dashboard request layer should expose unauthorized api error handling", () => {
  const source = fs.readFileSync(dashboardApiPath, "utf-8")
  const sharedSource = fs.readFileSync(dashboardSharedPath, "utf-8")

  assert.match(source, /class ConsoleApiError extends Error/)
  assert.match(source, /response\.status,\s*response\.statusText/)
  assert.match(sharedSource, /isUnauthorizedError/)
  assert.doesNotMatch(sharedSource, /message\.includes\("401"\)/)
})

test("console ui should preflight auth status before dashboard bootstrap", () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/hooks/useConsoleDashboard.ts"),
    "utf-8",
  )
  const apiSource = fs.readFileSync(dashboardApiPath, "utf-8")

  assert.match(apiSource, /authStatus:\s*\(\)\s*=>\s*"\/api\/auth\/status"/)
  assert.match(source, /dashboardApiRoutes\.authStatus\(\)/)
  assert.match(source, /setAuthRequired\(true\)/)
})

test("console ui should render a standalone auth gate page when login is required", () => {
  const appSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/App.tsx"),
    "utf-8",
  )
  const pageSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/components/dashboard/AuthGatePage.tsx"),
    "utf-8",
  )

  assert.match(appSource, /AuthGatePage/)
  assert.match(appSource, /authInitializing\s*\|\|\s*!isAuthenticated/)
  assert.match(pageSource, /先创建 Token/)
  assert.match(pageSource, /未登录时不再覆盖 dashboard，而是直接进入独立入口页/)
  assert.doesNotMatch(appSource, /访客模式/)
})
