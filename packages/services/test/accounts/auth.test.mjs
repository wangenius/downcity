import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { InfraRuntime } from "@downcity/infra"
import { createSqliteDb } from "./sqlite-db.mjs"
import { accountsService } from "../../bin/index.js"

test("accountsService registers users, logs in, and issues InfraRuntime tokens", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-accounts-service-"))

  try {
    process.chdir(tempDir)
    const { base, adminSecret } = await setupBase(tempDir)

    const product = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/products/create",
      body: { name: "Demo" },
    }))).json()

    const registerResponse = await base.handleRequest(jsonRequest("/v1/accounts/register", {
      email: "USER@example.com",
      password: "password123",
    }))
    assert.equal(registerResponse.status, 200)
    const registered = await registerResponse.json()
    assert.equal(registered.success, true)
    assert.equal(typeof registered.user_id, "string")

    if (registered.verification_token) {
      const verifyResponse = await base.handleRequest(jsonRequest("/v1/accounts/verify-email", {
        token: registered.verification_token,
        product_id: product.product_id,
      }))
      assert.equal(verifyResponse.status, 200)
      const verified = await verifyResponse.json()
      assert.equal(verified.user_token.startsWith("ub_"), true)
    }

    const loginResponse = await base.handleRequest(jsonRequest("/v1/accounts/login", {
      email: "user@example.com",
      password: "password123",
      product_id: product.product_id,
    }))
    assert.equal(loginResponse.status, 200)
    const loggedIn = await loginResponse.json()
    assert.equal(loggedIn.user_token.startsWith("ub_"), true)
    assert.equal(loggedIn.user_id, registered.user_id)

    const meResponse = await base.handleRequest(new Request("http://localhost/v1/accounts/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${loggedIn.user_token}`,
      },
    }))
    assert.equal(meResponse.status, 200)
    assert.equal((await meResponse.json()).user.user_id, loggedIn.user_id)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("accountsService reports enabled providers from server state", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-accounts-service-"))

  try {
    process.chdir(tempDir)
    const { base } = await setupBase(tempDir, {
      GITHUB_CLIENT_ID: "github_client_id",
      GITHUB_CLIENT_SECRET: "github_client_secret",
      WECHAT_CLIENT_ID: "wechat_client_id",
      WECHAT_CLIENT_SECRET: "wechat_client_secret",
    })

    const response = await base.handleRequest(new Request("http://localhost/v1/accounts/providers"))
    assert.equal(response.status, 200)

    const body = await response.json()
    assert.deepEqual(body.items, [
      {
        id: "email",
        type: "password",
        enabled: true,
        login_enabled: true,
        register_enabled: true,
      },
      {
        id: "github",
        type: "oauth",
        enabled: true,
      },
      {
        id: "google",
        type: "oauth",
        enabled: false,
        reason: "not_configured",
      },
      {
        id: "wechat",
        type: "oauth",
        enabled: true,
      },
    ])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("accountsService completes Google OAuth callback and resolves the state token", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-accounts-service-"))
  const originalFetch = globalThis.fetch

  try {
    process.chdir(tempDir)
    const { base, adminSecret } = await setupBase(tempDir, {
      GOOGLE_CLIENT_ID: "google_client_id",
      GOOGLE_CLIENT_SECRET: "google_client_secret",
    })

    const product = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/products/create",
      body: { name: "Demo" },
    }))).json()

    const startResponse = await base.handleRequest(jsonRequest("/v1/accounts/oauth/start", {
      provider: "google",
      product_id: product.product_id,
    }))
    assert.equal(startResponse.status, 200)
    const start = await startResponse.json()
    assert.equal(typeof start.state, "string")
    assert.equal(start.provider, "google")
    assert.match(start.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/)

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url

      if (url === "https://oauth2.googleapis.com/token") {
        assert.equal(init?.method, "POST")
        const params = new URLSearchParams(String(init?.body))
        assert.equal(params.get("client_id"), "google_client_id")
        assert.equal(params.get("client_secret"), "google_client_secret")
        assert.equal(params.get("code"), "test-google-code")
        return Response.json({ access_token: "google_access_token" })
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        assert.equal(readHeader(init?.headers, "authorization"), "Bearer google_access_token")
        return Response.json({
          sub: "google-user-123",
          email: "google-user@example.com",
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }

    const accounts = base.getService("accounts")
    const callbackResponse = await accounts.handleOAuthCallback(new Request(`http://localhost/v1/accounts/oauth/callback?state=${start.state}&code=test-google-code`))
    assert.equal(callbackResponse.status, 200)
    assert.match(await callbackResponse.text(), /Login Successful/)

    const resultResponse = await base.handleRequest(new Request(`http://localhost/v1/accounts/oauth/result?state=${start.state}`))
    assert.equal(resultResponse.status, 200)
    const result = await resultResponse.json()
    assert.equal(result.status, "done")
    assert.equal(result.user_token.startsWith("ub_"), true)

    const meResponse = await base.handleRequest(new Request("http://localhost/v1/accounts/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${result.user_token}`,
      },
    }))
    assert.equal(meResponse.status, 200)
    const me = await meResponse.json()
    assert.equal(me.profile.email, "google-user@example.com")
    assert.equal(me.profile.display_name, "google-user")
  } finally {
    globalThis.fetch = originalFetch
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("accountsService completes WeChat website OAuth callback and resolves the state token", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-accounts-service-"))
  const originalFetch = globalThis.fetch

  try {
    process.chdir(tempDir)
    const { base, adminSecret } = await setupBase(tempDir, {
      WECHAT_CLIENT_ID: "wechat_client_id",
      WECHAT_CLIENT_SECRET: "wechat_client_secret",
    })

    const product = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/products/create",
      body: { name: "Demo" },
    }))).json()

    const startResponse = await base.handleRequest(jsonRequest("/v1/accounts/oauth/start", {
      provider: "wechat",
      product_id: product.product_id,
    }))
    assert.equal(startResponse.status, 200)
    const start = await startResponse.json()
    assert.equal(typeof start.state, "string")
    assert.equal(start.provider, "wechat")
    assert.match(start.url, /^https:\/\/open\.weixin\.qq\.com\/connect\/qrconnect\?/)
    assert.match(start.url, /scope=snsapi_login/)

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url

      if (url.startsWith("https://api.weixin.qq.com/sns/oauth2/access_token?")) {
        const params = new URL(url).searchParams
        assert.equal(params.get("appid"), "wechat_client_id")
        assert.equal(params.get("secret"), "wechat_client_secret")
        assert.equal(params.get("code"), "test-wechat-code")
        assert.equal(params.get("grant_type"), "authorization_code")
        return Response.json({
          access_token: "wechat_access_token",
          refresh_token: "wechat_refresh_token",
          expires_in: 7200,
          openid: "wechat-open-id-123",
          scope: "snsapi_login",
          unionid: "wechat-union-id-123",
        })
      }

      if (url.startsWith("https://api.weixin.qq.com/sns/userinfo?")) {
        const params = new URL(url).searchParams
        assert.equal(params.get("access_token"), "wechat_access_token")
        assert.equal(params.get("openid"), "wechat-open-id-123")
        return Response.json({
          openid: "wechat-open-id-123",
          unionid: "wechat-union-id-123",
          nickname: "wechat-user",
          headimgurl: "https://example.com/wechat-avatar.png",
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }

    const accounts = base.getService("accounts")
    const callbackResponse = await accounts.handleOAuthCallback(new Request(`http://localhost/v1/accounts/oauth/callback?state=${start.state}&code=test-wechat-code`))
    assert.equal(callbackResponse.status, 200)
    assert.match(await callbackResponse.text(), /Login Successful/)

    const resultResponse = await base.handleRequest(new Request(`http://localhost/v1/accounts/oauth/result?state=${start.state}`))
    assert.equal(resultResponse.status, 200)
    const result = await resultResponse.json()
    assert.equal(result.status, "done")
    assert.equal(result.user_token.startsWith("ub_"), true)

    const meResponse = await base.handleRequest(new Request("http://localhost/v1/accounts/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${result.user_token}`,
      },
    }))
    assert.equal(meResponse.status, 200)
    const me = await meResponse.json()
    assert.equal(me.profile.email, "wechat_wechat-union-id-123@wechat.user")
    assert.equal(me.profile.display_name, "wechat-user")
    assert.equal(me.profile.avatar_url, "https://example.com/wechat-avatar.png")
  } finally {
    globalThis.fetch = originalFetch
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

async function setupBase(tempDir, env = {}) {
  const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
  const base = new InfraRuntime({ db, dialect: "sqlite", raw: db.raw })
  base.use(accountsService({ token_ttl: "7d" }))
  await base.health()

  const envProvider = base.getService("env")._env
  for (const [key, value] of Object.entries(env)) {
    await envProvider.upsert({ key, value: String(value) })
  }

  return {
    base,
    adminSecret: await readEnvValue(base, "DOWNCITY_INFRA_ADMIN_SECRET_KEY"),
  }
}

async function readEnvValue(base, key) {
  const envTable = await base.table("env")
  const rows = await envTable.select({ key })
  return rows[0]?.value ?? ""
}

function jsonRequest(pathname, body) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

function readHeader(headers, key) {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(key) ?? undefined
  const loweredKey = key.toLowerCase()
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === loweredKey) return String(value)
  }
  return undefined
}

function adminRequest(adminSecret, { path: pathname, method = "POST", body }) {
  return new Request(`http://localhost${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminSecret}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
