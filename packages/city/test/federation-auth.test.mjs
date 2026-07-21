/**
 * Federation Ed25519 user_token 与 FedBureau 集成测试。
 */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { FedBureau, Federation } from "../bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("Federation publishes public discovery and FedBureau identifies a City user", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-fed-bureau-"))
  try {
    const db = createSqliteDb(path.join(temp_dir, "test.sqlite"))
    const federation = new Federation({ db })
    const authenticator = await federation.getAuthenticator()
    const issued = await authenticator.createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      metadata: { plan: "pro" },
      ttl: "1h",
    })

    assert.match(issued.user_token, /^ub_[^.]+\.[^.]+\.[^.]+$/u)
    assert.equal(typeof issued.expires_at, "string")

    const discovery_response = await federation.fetch(new Request(
      "https://fed.example.com/.well-known/downcity.json",
    ))
    assert.equal(discovery_response.status, 200)
    const discovery = await discovery_response.json()
    assert.match(discovery.issuer, /^urn:downcity:federation:fed_/u)
    assert.equal(discovery.jwks_uri, "https://fed.example.com/.well-known/jwks.json")

    const jwks_response = await federation.fetch(new Request(
      "https://fed.example.com/.well-known/jwks.json",
    ))
    assert.equal(jwks_response.status, 200)
    const jwks = await jwks_response.json()
    assert.equal(jwks.keys.length, 1)
    assert.equal(jwks.keys[0].alg, "EdDSA")
    assert.equal(jwks.keys[0].crv, "Ed25519")
    assert.equal(jwks.keys[0].d, undefined)

    const bureau = new FedBureau({
      federation_url: "https://fed.example.com",
      city_id: "city_downcity",
      fetch: (input, init) => federation.fetch(new Request(input, init)),
    })
    const identity = await bureau.identify(new Request("https://product.example.com/me", {
      headers: { authorization: `Bearer ${issued.user_token}` },
    }))

    assert.deepEqual(identity, {
      user_id: "user_1",
      city_id: "city_downcity",
      metadata: { plan: "pro" },
      token_id: identity.token_id,
      expires_at: identity.expires_at,
    })
    assert.match(identity.token_id, /^token_/u)
    assert.equal(typeof identity.expires_at, "number")
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("FedBureau rejects a valid token from another City", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-fed-bureau-city-"))
  try {
    const db = createSqliteDb(path.join(temp_dir, "test.sqlite"))
    const federation = new Federation({ db })
    const authenticator = await federation.getAuthenticator()
    const issued = await authenticator.createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      ttl: "1h",
    })
    const bureau = new FedBureau({
      federation_url: "https://fed.example.com",
      city_id: "city_other",
      fetch: (input, init) => federation.fetch(new Request(input, init)),
    })

    await assert.rejects(
      bureau.identify(issued.user_token),
      (error) => error?.statusCode === 403
        && error.message === "Token does not belong to this City",
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("FedBureau rejects a user token with a modified signature", async () => {
  const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-fed-bureau-signature-"))
  try {
    const db = createSqliteDb(path.join(temp_dir, "test.sqlite"))
    const federation = new Federation({ db })
    const authenticator = await federation.getAuthenticator()
    const issued = await authenticator.createToken({
      city_id: "city_downcity",
      user_id: "user_1",
      ttl: "1h",
    })
    const bureau = new FedBureau({
      federation_url: "https://fed.example.com",
      city_id: "city_downcity",
      fetch: (input, init) => federation.fetch(new Request(input, init)),
    })
    const modified = `${issued.user_token.slice(0, -1)}${issued.user_token.endsWith("A") ? "B" : "A"}`

    await assert.rejects(
      bureau.identify(modified),
      (error) => error?.statusCode === 401
        && error.message === "Invalid user token signature",
    )
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test("Federation issuer and active signing key survive runtime restart", async () => {
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
