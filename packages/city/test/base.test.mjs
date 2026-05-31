import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { CityBase, AIService } from "../bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("CityBase instruction aggregates built-in and service documentation", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-instruction-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    base.use({
      id: "demo",
      name: "Demo InstallableService",
      instruction: "这是一个测试服务说明。",
      install(ctx) {
        ctx.route({
          method: "GET",
          path: "/ping",
          auth: ["admin"],
          handler() {
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          },
        })
      },
    })

    const text = await base.instruction()

    assert.match(text, /# Downcity CityBase Instruction/)
    assert.match(text, /## Env \(env\)/)
    assert.match(text, /## Towns \(towns\)/)
    assert.match(text, /## Demo InstallableService \(demo\)/)
    assert.match(text, /这是一个测试服务说明。/)
    assert.match(text, /GET \/v1\/demo\/ping \| auth: admin/)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("CityBase instruction endpoint requires admin auth and returns text", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-instruction-http-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const guestResponse = await base.handleRequest(new Request("http://localhost/v1/city/instruction", {
      method: "GET",
    }))
    assert.equal(guestResponse.status, 401)
    assert.deepEqual(await guestResponse.json(), {
      error: {
        message: "Authentication required",
        type: "server_error",
      },
    })

    const adminResponse = await base.handleRequest(new Request("http://localhost/v1/city/instruction", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    }))

    assert.equal(adminResponse.status, 200)
    assert.equal(adminResponse.headers.get("content-type"), "text/plain; charset=utf-8")
    assert.match(await adminResponse.text(), /Downcity CityBase Instruction/)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("CityBase bootstraps internal secrets into the env table", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-env-bootstrap-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    await base.health()

    const envProvider = base.getService("env")._env
    assert.match(envProvider.get("DOWNCITY_CITY_ADMIN_SECRET_KEY"), /^admin_/)
    assert.match(envProvider.get("DOWNCITY_CITY_TOKEN_SIGNING_KEY"), /^sign_/)
    assert.match(envProvider.get("BETTER_AUTH_SECRET"), /^better_auth_/)

    const items = await envProvider.list()
    assert.deepEqual(items.map((item) => item.key).sort(), [
      "BETTER_AUTH_SECRET",
      "DOWNCITY_CITY_ADMIN_SECRET_KEY",
      "DOWNCITY_CITY_TOKEN_SIGNING_KEY",
    ])

    const envTable = await base.table("env")
    const rows = await envTable.select()
    assert.equal(rows.length, 3)
    for (const row of rows) {
      assert.equal(typeof row.key, "string")
      assert.equal(typeof row.value, "string")
      assert.equal(typeof row.created_at, "string")
      assert.equal(typeof row.updated_at, "string")
    }
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("CityBase rejects mismatched town_id for authenticated user requests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-town-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService()
    ai.use({
      id: "echo-text",
      name: "Echo Text",
      default: ["text"],
      actions: {
        text: async () => ({
          id: "msg_1",
          role: "assistant",
          parts: [{ type: "text", text: "ok", state: "done" }],
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const bay_response = await base.handleRequest(new Request("http://localhost/v1/towns/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({
        name: "Demo",
      }),
    }))
    const town = await bay_response.json()

    const authenticator = await base.getAuthenticator()
    const issued = await authenticator.createToken({
      town_id: town.town_id,
      user_id: "user_1",
    })

    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.user_token}`,
      },
      body: JSON.stringify({
        town_id: "town_other",
        prompt: "hi",
      }),
    }))

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      error: {
        message: "town_id does not match the authenticated token",
        type: "server_error",
      },
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("CityBase exposes service env requirements and env catalog", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-core-services-env-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    base.use({
      id: "payment.stripe",
      name: "Stripe Payment",
      env: [
        { key: "STRIPE_SECRET_KEY", description: "stripe secret", required: true },
        { key: "STRIPE_WEBHOOK_SECRET", description: "stripe webhook", required: false },
      ],
      install() {},
    })

    const ai = new AIService()
    ai.use({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      env: {
        DEEPSEEK_API_KEY: "DeepSeek API Key",
      },
      actions: {
        text: async () => ({ ok: true }),
      },
    })
    base.use(ai)

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/services", {
      method: "GET",
    }))
    assert.equal(response.status, 200)

    const body = await response.json()
    const stripe = body.items.find((item) => item.id === "payment.stripe")
    assert.deepEqual(stripe, {
      id: "payment.stripe",
      name: "Stripe Payment",
      env: [
        { key: "STRIPE_SECRET_KEY", description: "stripe secret", required: true },
        { key: "STRIPE_WEBHOOK_SECRET", description: "stripe webhook", required: false },
      ],
    })

    await base.getService("env")._env.upsert({ key: "STRIPE_SECRET_KEY", value: "sk_test" })
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const catalogResponse = await base.handleRequest(new Request("http://localhost/v1/env/catalog", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    }))
    assert.equal(catalogResponse.status, 200)

    const catalog = await catalogResponse.json()
    assert.deepEqual(catalog.items, [
      {
        id: "payment.stripe",
        name: "Stripe Payment",
        env: [
          { key: "STRIPE_SECRET_KEY", description: "stripe secret", required: true, configured: true, value_preview: "sk_test" },
          { key: "STRIPE_WEBHOOK_SECRET", description: "stripe webhook", required: false, configured: false },
        ],
      },
      {
        id: "ai-models",
        name: "AI Models",
        env: [
          {
            key: "DEEPSEEK_API_KEY",
            description: "DeepSeek API Key - used by DeepSeek V4 Flash",
            required: true,
            configured: false,
          },
        ],
      },
    ])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("CityBase refreshes runtime env before each request so external env updates take effect immediately", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-env-refresh-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })

    base.use({
      id: "demo.env",
      name: "Demo Env",
      env: [
        { key: "GOOGLE_CLIENT_ID", description: "google client id", required: false },
      ],
      install(ctx) {
        const readEnv = ctx.env
        ctx.route({
          method: "GET",
          path: "/value",
          auth: [],
          handler: async (ctx) => ctx.jsonResponse({
            google_client_id: readEnv("GOOGLE_CLIENT_ID") ?? null,
          }),
        })
      },
    })

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const beforeResponse = await base.handleRequest(new Request("http://localhost/v1/demo.env/value", {
      method: "GET",
    }))
    assert.equal(beforeResponse.status, 200)
    assert.deepEqual(await beforeResponse.json(), { google_client_id: null })

    const envTable = await base.table("env")
    const now = new Date().toISOString()
    await envTable.insert({
      key: "GOOGLE_CLIENT_ID",
      value: "google-client-id-live",
      source: "database",
      created_at: now,
      updated_at: now,
    })

    const afterResponse = await base.handleRequest(new Request("http://localhost/v1/demo.env/value", {
      method: "GET",
    }))
    assert.equal(afterResponse.status, 200)
    assert.deepEqual(await afterResponse.json(), { google_client_id: "google-client-id-live" })

    const catalogResponse = await base.handleRequest(new Request("http://localhost/v1/env/catalog", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    }))
    assert.equal(catalogResponse.status, 200)

    const catalog = await catalogResponse.json()
    const demoScope = catalog.items.find((item) => item.id === "demo.env")
    assert.equal(demoScope.env[0].configured, true)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

async function readEnvValue(base, key) {
  const envTable = await base.table("env")
  const rows = await envTable.select({ key })
  return rows[0]?.value ?? ""
}
