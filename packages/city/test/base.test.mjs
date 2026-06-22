import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { Federation, AIService, Provider } from "../bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("Federation instruction aggregates built-in and service documentation", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-instruction-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

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

    assert.match(text, /# Downcity Federation Instruction/)
    assert.match(text, /## Env \(env\)/)
    assert.match(text, /## Cities \(cities\)/)
    assert.match(text, /## Demo InstallableService \(demo\)/)
    assert.match(text, /这是一个测试服务说明。/)
    assert.match(text, /GET \/v1\/demo\/ping \| auth: admin/)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation instruction endpoint requires admin auth and returns text", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-instruction-http-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const guestResponse = await base.handleRequest(new Request("http://localhost/v1/federation/instruction", {
      method: "GET",
    }))
    assert.equal(guestResponse.status, 401)
    assert.deepEqual(await guestResponse.json(), {
      error: {
        message: "Authentication required",
        type: "server_error",
      },
    })

    const adminResponse = await base.handleRequest(new Request("http://localhost/v1/federation/instruction", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    }))

    assert.equal(adminResponse.status, 200)
    assert.equal(adminResponse.headers.get("content-type"), "text/plain; charset=utf-8")
    assert.match(await adminResponse.text(), /Downcity Federation Instruction/)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation bootstraps internal secrets into the env table", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-env-bootstrap-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    await base.health()

    const envProvider = base.getService("env")._env
    assert.match(envProvider.get("DOWNCITY_FEDERATION_ADMIN_SECRET_KEY"), /^admin_/)
    assert.match(envProvider.get("DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY"), /^sign_/)
    assert.match(envProvider.get("BETTER_AUTH_SECRET"), /^better_auth_/)

    const items = await envProvider.list()
    assert.deepEqual(items.map((item) => item.key).sort(), [
      "BETTER_AUTH_SECRET",
      "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY",
      "DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY",
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

test("InstallableService route supports native Request handlers", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-native-route-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    base.use({
      id: "native",
      name: "Native Route Demo",
      install(ctx) {
        ctx.route({
          method: "ALL",
          path: "/echo/*",
          public: true,
          handler: {
            request: async (request) => Response.json({
              method: request.method,
              pathname: new URL(request.url).pathname,
              query: new URL(request.url).searchParams.get("q"),
              header: request.headers.get("x-demo"),
              body: await request.text(),
            }),
          },
        })
      },
    })

    await base.health()

    const response = await base.handleRequest(new Request("http://example.com/v1/native/echo/deep/path?q=yes", {
      method: "PUT",
      headers: {
        "content-type": "text/plain",
        "x-demo": "kept",
      },
      body: "raw body",
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      method: "PUT",
      pathname: "/v1/native/echo/deep/path",
      query: "yes",
      header: "kept",
      body: "raw body",
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation rejects mismatched city_id for authenticated user requests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-city-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

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
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const bay_response = await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({
        name: "Demo",
      }),
    }))
    const city = await bay_response.json()

    const authenticator = await base.getAuthenticator()
    const issued = await authenticator.createToken({
      city_id: city.city_id,
      user_id: "user_1",
    })

    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.user_token}`,
      },
      body: JSON.stringify({
        city_id: "city_other",
        prompt: "hi",
      }),
    }))

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      error: {
        message: "city_id does not match the authenticated token",
        type: "server_error",
      },
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService charges explicit provider charge lines", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-explicit-charge-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const charges = []
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService({
      balance: {
        async charge(input) {
          charges.push({
            user_id: input.user_id,
            amount_microcredits: input.amount_microcredits,
            note: input.note,
            metadata: input.metadata,
          })
        },
      },
    })
    ai.use({
      id: "priced-text",
      provider_id: "priced-provider",
      name: "Priced Text",
      default: ["text"],
      actions: {
        text: async () => ({
          output: {
            id: "msg_1",
            role: "assistant",
            parts: [{ type: "text", text: "ok", state: "done" }],
          },
          charge: {
            amount_microcredits: 123,
            note: "provider charge",
            metadata: { provider_id: "priced-provider" },
          },
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name: "Demo" }),
    }))).json()
    const tokenBody = await (await base.handleRequest(new Request("http://localhost/v1/cities/tokens/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ city_id: city.city_id, user_id: "user_1" }),
    }))).json()

    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenBody.user_token}`,
      },
      body: JSON.stringify({ model: "priced-text", prompt: "hi" }),
    }))

    assert.equal(response.status, 200)
    assert.equal((await response.json()).id, "msg_1")
    assert.deepEqual(charges, [{
      user_id: "user_1",
      amount_microcredits: 123,
      note: "provider charge",
      metadata: { provider_id: "priced-provider" },
    }])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService uses provider bill when model bill is not set", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-provider-bill-"))

  class TestProvider extends Provider {
    async text() {
      return {
        output: {
          id: "msg_provider_bill",
          role: "assistant",
          parts: [{ type: "text", text: "ok" }],
        },
      }
    }

    bill(ctx, output) {
      return {
        amount_microcredits: 222,
        note: "provider bill",
        ref: output.id,
        metadata: {
          model_id: ctx.metering?.model_id,
          provider_id: ctx.metering?.provider_id,
        },
      }
    }
  }

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const charges = []
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService({
      balance: {
        async charge(input) {
          charges.push({
            amount_microcredits: input.amount_microcredits,
            note: input.note,
            ref: input.ref,
            metadata: input.metadata,
          })
        },
      },
    })
    const provider = new TestProvider({ id: "test-provider" })
    ai.use(provider.model({
      id: "provider-billed-text",
      name: "Provider Billed Text",
      default: ["text"],
    }))
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const city = await (await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name: "Demo" }),
    }))).json()
    const tokenBody = await (await base.handleRequest(new Request("http://localhost/v1/cities/tokens/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ city_id: city.city_id, user_id: "user_1" }),
    }))).json()
    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenBody.user_token}`,
      },
      body: JSON.stringify({ model: "provider-billed-text", prompt: "hi" }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(charges, [{
      amount_microcredits: 222,
      note: "provider bill",
      ref: "msg_provider_bill",
      metadata: {
        model_id: "provider-billed-text",
        provider_id: "test-provider",
      },
    }])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService lets model bill override provider bill", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-model-bill-override-"))

  class TestProvider extends Provider {
    async text() {
      return {
        output: {
          id: "msg_model_bill",
          role: "assistant",
          parts: [{ type: "text", text: "ok" }],
        },
      }
    }

    bill() {
      return {
        amount_microcredits: 222,
        note: "provider bill",
      }
    }
  }

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const charges = []
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService({
      balance: {
        async charge(input) {
          charges.push({
            amount_microcredits: input.amount_microcredits,
            note: input.note,
          })
        },
      },
    })
    const provider = new TestProvider({ id: "test-provider" })
    ai.use(provider.model({
      id: "model-billed-text",
      name: "Model Billed Text",
      default: ["text"],
      bill() {
        return {
          amount_microcredits: 333,
          note: "model bill",
        }
      },
    }))
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const city = await (await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name: "Demo" }),
    }))).json()
    const tokenBody = await (await base.handleRequest(new Request("http://localhost/v1/cities/tokens/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ city_id: city.city_id, user_id: "user_1" }),
    }))).json()
    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenBody.user_token}`,
      },
      body: JSON.stringify({ model: "model-billed-text", prompt: "hi" }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(charges, [{
      amount_microcredits: 333,
      note: "model bill",
    }])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation AI image jobs persist and finish through waitUntil", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-image-job-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })
    const message = {
      id: "msg_image_1",
      role: "assistant",
      parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,abc" }],
    }

    const ai = new AIService()
    ai.use({
      id: "echo-image",
      name: "Echo Image",
      default: ["image"],
      actions: {
        image: async () => message,
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const pending = []
    const createResponse = await base.handleRequest(new Request("http://localhost/v1/ai/image/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ prompt: "draw" }),
    }), {
      execution: {
        waitUntil(promise) {
          pending.push(promise)
        },
      },
    })

    assert.equal(createResponse.status, 200)
    const created = await createResponse.json()
    assert.equal(created.status, "queued")
    assert.equal(typeof created.job_id, "string")

    await Promise.all(pending)

    const resultResponse = await base.handleRequest(new Request("http://localhost/v1/ai/image/result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ job_id: created.job_id }),
    }))

    assert.equal(resultResponse.status, 200)
    assert.deepEqual(await resultResponse.json(), {
      job_id: created.job_id,
      status: "succeeded",
      result: message,
      message: "succeeded",
      poll_after_ms: 2000,
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService charges image create requests from model bill", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-image-create-charge-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const charges = []
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService({
      balance: {
        async charge(input) {
          charges.push(input)
        },
      },
    })
    ai.use({
      id: "priced-image",
      provider_id: "image-provider",
      name: "Priced Image",
      default: ["image"],
      bill(ctx, output) {
        return {
          amount_microcredits: 777,
          note: "AI image create",
          ref: output.job_id,
          metadata: {
            service_id: "ai",
            action_id: ctx.metering?.metadata?.mode,
            model_id: ctx.metering?.model_id,
            provider_id: ctx.metering?.provider_id,
          },
        }
      },
      actions: {
        image: async () => ({
          id: "msg_image",
          role: "assistant",
          parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,aQ==" }],
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name: "Demo" }),
    }))).json()
    const tokenBody = await (await base.handleRequest(new Request("http://localhost/v1/cities/tokens/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ city_id: city.city_id, user_id: "user_1" }),
    }))).json()

    const response = await base.handleRequest(new Request("http://localhost/v1/ai/image/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenBody.user_token}`,
      },
      body: JSON.stringify({ model: "priced-image", prompt: "draw" }),
    }), {
      execution: {
        waitUntil() {},
      },
    })

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.match(body.job_id, /^img_/)
    assert.deepEqual(charges, [{
      user_id: "user_1",
      amount_microcredits: 777,
      note: "AI image create",
      ref: body.job_id,
      metadata: {
        service_id: "ai",
        action_id: "image/create",
        model_id: "priced-image",
        provider_id: "image-provider",
      },
    }])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService prefers action charge over model bill", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-charge-priority-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const charges = []
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

    const ai = new AIService({
      balance: {
        async charge(input) {
          charges.push({
            amount_microcredits: input.amount_microcredits,
            note: input.note,
          })
        },
      },
    })
    ai.use({
      id: "priority-text",
      provider_id: "priority-provider",
      name: "Priority Text",
      default: ["text"],
      bill() {
        return {
          amount_microcredits: 999,
          note: "model bill",
        }
      },
      actions: {
        text: async () => ({
          output: {
            id: "msg_priority",
            role: "assistant",
            parts: [{ type: "text", text: "ok" }],
          },
          charge: {
            amount_microcredits: 111,
            note: "action charge",
          },
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const city = await (await base.handleRequest(new Request("http://localhost/v1/cities/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name: "Demo" }),
    }))).json()
    const tokenBody = await (await base.handleRequest(new Request("http://localhost/v1/cities/tokens/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ city_id: city.city_id, user_id: "user_1" }),
    }))).json()

    const response = await base.handleRequest(new Request("http://localhost/v1/ai/text", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenBody.user_token}`,
      },
      body: JSON.stringify({ model: "priority-text", prompt: "hi" }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(charges, [{
      amount_microcredits: 111,
      note: "action charge",
    }])
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation AI image jobs can advance through result polling", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-image-job-poll-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })
    const message = {
      id: "msg_image_1",
      role: "assistant",
      parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,abc" }],
    }
    let calls = 0

    const ai = new AIService()
    ai.use({
      id: "step-image",
      name: "Step Image",
      default: ["image"],
      actions: {
        image: async () => message,
        image_job: async (ctx) => {
          calls += 1
          const state = ctx.locals.image_job?.state
          if (state?.upstream_job_id === "up_1") {
            return { status: "succeeded", result: message, message: "succeeded" }
          }
          return {
            status: "running",
            state: { upstream_job_id: "up_1" },
            message: "running",
            poll_after_ms: 10,
          }
        },
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    const createResponse = await base.handleRequest(new Request("http://localhost/v1/ai/image/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ prompt: "draw" }),
    }))
    const created = await createResponse.json()
    assert.equal(created.status, "running")
    assert.equal(calls, 1)

    const result = await base.handleRequest(new Request("http://localhost/v1/ai/image/result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ job_id: created.job_id }),
    }))
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), {
      job_id: created.job_id,
      status: "succeeded",
      result: message,
      message: "succeeded",
      poll_after_ms: 2000,
    })
    assert.equal(calls, 2)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("Federation exposes service env requirements and env catalog", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-core-services-env-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

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
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

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

test("Federation refreshes runtime env only after explicit env refresh", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-city-env-refresh-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

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
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

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

    const cachedResponse = await base.handleRequest(new Request("http://localhost/v1/demo.env/value", {
      method: "GET",
    }))
    assert.equal(cachedResponse.status, 200)
    assert.deepEqual(await cachedResponse.json(), { google_client_id: null })

    const refreshResponse = await base.handleRequest(new Request("http://localhost/v1/env/refresh", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    }))
    assert.equal(refreshResponse.status, 200)
    const refreshBody = await refreshResponse.json()
    assert.equal(refreshBody.success, true)
    assert.equal(typeof refreshBody.count, "number")
    assert.ok(refreshBody.count >= 1)

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
