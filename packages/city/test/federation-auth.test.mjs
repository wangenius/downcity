/**
 * Federation Ed25519 user_token 与 Bureau 本地验签集成测试。
 */

import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { Bureau, Federation, FederationAdmin } from "../bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("Federation 不默认创建 Bureau Token，Bureau 使用显式注册上下文本地验签", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-bureau-local-"))
  try {
    const federation = new Federation({
      db: createSqliteDb(path.join(temp_dir, "test.sqlite")),
    })
    await federation.health()
    const admin = await create_admin(federation)
    assert.deepEqual(await admin.bureaus.list(), [])

    const unauthorized = await federation.fetch(new Request("http://localhost/v1/bureaus/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token_id: "br_1234567890abcdef",
        token_hash: "1234567890123456789012345678901234567890123",
        city_id: "city_downcity",
      }),
    }))
    assert.equal(unauthorized.status, 401)

    const credential = await register_bureau(admin, { city_id: "city_downcity" })
    const user_token = await (await federation.getAuthenticator()).createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      metadata: { plan: "pro" },
      ttl: "1h",
    })
    const requested_paths = []
    const bureau = new Bureau({
      federation_url: "https://fed.example.com",
      bureau_token: credential.bureau_token,
      fetch: async (input, init) => {
        requested_paths.push(new URL(String(input)).pathname)
        return federation.fetch(new Request(input, init))
      },
    })
    const request = new Request("https://product.example.com/private", {
      headers: { authorization: `Bearer ${user_token.user_token}` },
    })

    const first = await bureau.identify(request)
    const second = await bureau.identify(request)
    assert.deepEqual(first, second)
    assert.equal(first.user_id, "user_1")
    assert.equal(first.city_id, "city_downcity")
    assert.deepEqual(first.metadata, { plan: "pro" })
    assert.equal(bureau.city_id, "city_downcity")
    assert.deepEqual(requested_paths, [
      "/.well-known/downcity.json",
      "/.well-known/jwks.json",
      "/v1/bureaus/context",
    ])
    assert.equal(requested_paths.includes("/v1/accounts/identify"), false)

    const items = await admin.bureaus.list()
    assert.equal(items.length, 1)
    assert.equal(items[0].city_id, "city_downcity")
    assert.equal("name" in items[0], false)
    assert.equal("token_hash" in items[0], false)
    assert.equal("bureau_token" in items[0], false)
    assert.equal("name" in await bureau.context(), false)

    await admin.bureaus.revoke(credential.token_id)
    const revoked = create_bureau(federation, credential.bureau_token)
    await assert.rejects(
      revoked.identify(request),
      (error) => error?.statusCode === 401,
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Bureau 拒绝另一个 City 的有效 user_token", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-bureau-city-"))
  try {
    const federation = new Federation({
      db: createSqliteDb(path.join(temp_dir, "test.sqlite")),
    })
    await federation.health()
    const admin = await create_admin(federation)
    const other_city = await admin.cities.create({ name: "Other Product" })
    const credential = await register_bureau(admin, { city_id: other_city.city_id })
    const user_token = await (await federation.getAuthenticator()).createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      ttl: "1h",
    })

    await assert.rejects(
      create_bureau(federation, credential.bureau_token).identify(user_token.user_token),
      (error) => error?.statusCode === 403
        && error.message === "Token does not belong to this City",
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Bureau 拒绝被修改签名的 user_token", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-bureau-signature-"))
  try {
    const federation = new Federation({
      db: createSqliteDb(path.join(temp_dir, "test.sqlite")),
    })
    await federation.health()
    const admin = await create_admin(federation)
    const credential = await register_bureau(admin, { city_id: "city_downcity" })
    const user_token = await (await federation.getAuthenticator()).createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      ttl: "1h",
    })
    const segments = user_token.user_token.split(".")
    segments[2] = `${segments[2][0] === "A" ? "B" : "A"}${segments[2].slice(1)}`
    const modified = segments.join(".")

    await assert.rejects(
      create_bureau(federation, credential.bureau_token).identify(modified),
      (error) => error?.statusCode === 401
        && error.message === "Invalid user token signature",
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Federation issuer 和签名公钥在 runtime 重启后保持不变", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-fed-key-restart-"))
  try {
    const db = createSqliteDb(path.join(temp_dir, "test.sqlite"))
    const first = new Federation({ db })
    await first.health()
    const first_discovery = await (await first.fetch(new Request(
      "https://fed.example.com/.well-known/downcity.json",
    ))).json()
    const first_jwks = await (await first.fetch(new Request(
      "https://fed.example.com/.well-known/jwks.json",
    ))).json()

    const second = new Federation({ db })
    await second.health()
    const second_discovery = await (await second.fetch(new Request(
      "https://fed.example.com/.well-known/downcity.json",
    ))).json()
    const second_jwks = await (await second.fetch(new Request(
      "https://fed.example.com/.well-known/jwks.json",
    ))).json()

    assert.equal(second_discovery.issuer, first_discovery.issuer)
    assert.equal(second_jwks.keys[0].kid, first_jwks.keys[0].kid)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

function create_bureau(federation, bureau_token) {
  return new Bureau({
    federation_url: "http://localhost",
    bureau_token,
    fetch: (input, init) => federation.fetch(new Request(input, init)),
  })
}

async function create_admin(federation) {
  const rows = await (await federation.table("env")).select({
    key: "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY",
  })
  return new FederationAdmin({
    federation_url: "http://localhost",
    admin_secret_key: rows[0]?.value ?? "",
    fetch: (input, init) => federation.fetch(new Request(input, init)),
  })
}

async function register_bureau(admin, input) {
  const token_id = `br_${randomBytes(12).toString("base64url")}`
  const bureau_token = `fb_${token_id}.${randomBytes(32).toString("base64url")}`
  const token_hash = createHash("sha256").update(bureau_token, "utf8").digest("base64url")
  const registered = await admin.bureaus.register({
    token_id,
    token_hash,
    ...input,
  })
  assert.equal(registered.token_id, token_id)
  assert.equal("token_hash" in registered, false)
  assert.equal("bureau_token" in registered, false)
  return { token_id, bureau_token }
}
