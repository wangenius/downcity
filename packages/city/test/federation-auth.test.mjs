/**
 * Federation 非对称 user_token 与 Bureau Token 集成测试。
 */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { Bureau, Federation, Service } from "../bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("Federation 签发绑定 City 的 Bureau Token，并支持即时撤销", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-bureau-token-"))
  try {
    const db = createSqliteDb(path.join(temp_dir, "test.sqlite"))
    const federation = new Federation({ db })
    const probe = new Service({ id: "bureau-probe", name: "Bureau Probe" })
    probe.action("identity", async (ctx) => ({ bureau: ctx.bureau }), { auth: ["bureau"] })
    federation.use(probe)
    await federation.health()

    const root_token = await read_env_value(federation, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const root = create_bureau(federation, root_token)
    const city = await root.cities.create({ name: "Product A" })
    const issued = await root.bureaus.create({
      name: "Product A Backend",
      city_id: city.city_id,
    })

    assert.match(issued.bureau_token, /^fb_br_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
    assert.equal(issued.city_id, city.city_id)
    assert.deepEqual(issued.capabilities, ["accounts:read"])

    const bureau = create_bureau(federation, issued.bureau_token)
    const identity = await bureau.service("bureau-probe").action("identity").invoke()
    assert.equal(identity.bureau.token_id, issued.token_id)
    assert.equal(identity.bureau.city_id, city.city_id)

    await assert.rejects(
      bureau.bureaus.list(),
      (error) => error?.status === 403,
    )

    await root.bureaus.revoke(issued.token_id)
    await assert.rejects(
      bureau.service("bureau-probe").action("identity").invoke(),
      (error) => error?.status === 401,
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Federation root Bureau 可以签发和使用管理型 Bureau Token", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-root-bureau-"))
  try {
    const federation = new Federation({
      db: createSqliteDb(path.join(temp_dir, "test.sqlite")),
    })
    await federation.health()

    const bootstrap_token = await read_env_value(federation, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const bootstrap = create_bureau(federation, bootstrap_token)
    const issued = await bootstrap.bureaus.create({
      name: "Operations",
      capabilities: ["federation:admin"],
    })
    const root = create_bureau(federation, issued.bureau_token)

    const city = await root.cities.create({ name: "Managed Product" })
    assert.equal(city.name, "Managed Product")
    assert.equal(issued.city_id, "")
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Federation 继续发布公共发现信息和 Ed25519 公钥", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-fed-discovery-"))
  try {
    const federation = new Federation({
      db: createSqliteDb(path.join(temp_dir, "test.sqlite")),
    })
    const authenticator = await federation.getAuthenticator()
    const issued = await authenticator.createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      metadata: { plan: "pro" },
      ttl: "1h",
    })

    assert.match(issued.user_token, /^ub_[^.]+\.[^.]+\.[^.]+$/u)
    const discovery = await (await federation.fetch(new Request(
      "https://fed.example.com/.well-known/downcity.json",
    ))).json()
    const jwks = await (await federation.fetch(new Request(
      "https://fed.example.com/.well-known/jwks.json",
    ))).json()

    assert.match(discovery.issuer, /^urn:downcity:federation:fed_/u)
    assert.equal(discovery.jwks_uri, "https://fed.example.com/.well-known/jwks.json")
    assert.equal(jwks.keys.length, 1)
    assert.equal(jwks.keys[0].alg, "EdDSA")
    assert.equal(jwks.keys[0].crv, "Ed25519")
    assert.equal(jwks.keys[0].d, undefined)
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

async function read_env_value(federation, key) {
  const rows = await (await federation.table("env")).select({ key })
  return rows[0]?.value ?? ""
}
