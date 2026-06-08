import assert from "node:assert/strict"
import test from "node:test"

import { City, CityBase } from "../bin/index.js"

test("AIInvoker.text() posts to /v1/ai/text", async () => {
  const requests = []
  const msg = { id: "msg_1", role: "assistant", parts: [{ type: "text", text: "hello", state: "done" }] }
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => { requests.push({ url, init }); return json(msg) },
  })
  const result = await client.ai.text({ prompt: "hi" })
  assert.deepEqual(result, msg)
  assert.equal(requests[0].url, "https://api.example.com/base/v1/ai/text")
  assert.equal(requests[0].init.headers.authorization, "Bearer ub_test")
  assert.deepEqual(JSON.parse(requests[0].init.body), { prompt: "hi", town_id: "town_demo" })
})

test("AIInvoker.image_create() posts to /v1/ai/image/create", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => {
      requests.push({ url, init })
      return json({ job_id: "img_1", status: "queued", poll_after_ms: 2000 })
    },
  })

  const result = await client.ai.image_create({
    prompt: "draw a mug",
    model: "openai-gpt-image-1",
    size: "1024x1024",
    count: 1,
  })

  assert.deepEqual(result, { job_id: "img_1", status: "queued", poll_after_ms: 2000 })
  assert.equal(requests[0].url, "https://api.example.com/base/v1/ai/image/create")
  assert.equal(requests[0].init.headers.authorization, "Bearer ub_test")
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    prompt: "draw a mug",
    model: "openai-gpt-image-1",
    size: "1024x1024",
    count: 1,
    town_id: "town_demo",
  })
})

test("AIInvoker.image_result() posts to /v1/ai/image/result", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => {
      requests.push({ url, init })
      return json({ job_id: "img_1", status: "running", poll_after_ms: 2000 })
    },
  })

  const result = await client.ai.image_result({ job_id: "img_1" })

  assert.deepEqual(result, { job_id: "img_1", status: "running", poll_after_ms: 2000 })
  assert.equal(requests[0].url, "https://api.example.com/base/v1/ai/image/result")
  assert.equal(requests[0].init.headers.authorization, "Bearer ub_test")
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    job_id: "img_1",
    town_id: "town_demo",
  })
})

test("AIInvoker.image() creates and polls image jobs", async () => {
  const requests = []
  const msg = {
    id: "msg_image_1",
    role: "assistant",
    parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,abc" }],
  }
  let result_calls = 0
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (url.endsWith("/v1/ai/image/create")) {
        return json({ job_id: "img_1", status: "queued", poll_after_ms: 1 })
      }
      result_calls += 1
      if (result_calls === 1) {
        return json({ job_id: "img_1", status: "running", poll_after_ms: 1 })
      }
      return json({ job_id: "img_1", status: "succeeded", result: msg, poll_after_ms: 1 })
    },
  })

  const result = await client.ai.image({
    prompt: "draw a mug",
    model: "openai-gpt-image-1",
    size: "1024x1024",
    count: 1,
  })

  assert.deepEqual(result, msg)
  assert.equal(requests[0].url, "https://api.example.com/base/v1/ai/image/create")
  assert.equal(requests[1].url, "https://api.example.com/base/v1/ai/image/result")
  assert.equal(requests[2].url, "https://api.example.com/base/v1/ai/image/result")
})

test("AIInvoker.image() throws failed image job errors", async () => {
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url) => {
      if (url.endsWith("/v1/ai/image/create")) {
        return json({ job_id: "img_1", status: "queued", poll_after_ms: 1 })
      }
      return json({ job_id: "img_1", status: "failed", error: "upstream failed", poll_after_ms: 1 })
    },
  })

  await assert.rejects(
    () => client.ai.image({ prompt: "draw" }),
    /Downcity image job failed: upstream failed/,
  )
})

test("AIInvoker.text() serializes AI SDK provider tools with inputSchema", async () => {
  const requests = []
  const msg = { id: "msg_1", role: "assistant", parts: [{ type: "text", text: "hello" }] }
  const inputSchema = {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Shell command" },
    },
    required: ["cmd"],
    additionalProperties: false,
  }
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => { requests.push({ url, init }); return json(msg) },
  })

  await client.ai.text({
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "run pwd" }] }],
    tools: [
      {
        type: "function",
        name: "exec_command",
        description: "Run shell command",
        inputSchema,
      },
    ],
  })

  assert.deepEqual(JSON.parse(requests[0].init.body).tools, [
    {
      type: "function",
      function: {
        name: "exec_command",
        description: "Run shell command",
        parameters: inputSchema,
      },
    },
  ])
})

test("User City delegates AI calls", async () => {
  const requests = []
  const msg = { id: "msg_1", role: "assistant", parts: [{ type: "text", text: "hello", state: "done" }] }
  const city = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async (url, init) => { requests.push({ url, init }); return json(msg) },
  })
  const result = await city.ai.text({ prompt: "hi" })
  assert.deepEqual(result, msg)
  assert.equal(requests[0].url, "https://api.example.com/base/v1/ai/text")
  assert.deepEqual(JSON.parse(requests[0].init.body), { prompt: "hi", town_id: "town_demo" })
})

test("AIInvoker.listModels() returns ModelCatalog", async () => {
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo", user_token: "ub_test",
    fetch: async () => json({ items: [
      { id: "gpt-5.4", name: "GPT-5.4", description: "P", modalities: ["text", "stream"], tags: [], meta: {}, env: {} },
      { id: "claude", name: "Claude", description: "A", modalities: ["text"], tags: [], meta: {}, env: {} },
    ]}),
  })
  const catalog = await client.ai.listModels()
  assert.equal(catalog.get("gpt-5.4").id, "gpt-5.4")
  assert.equal(catalog.default().id, "gpt-5.4")
  assert.equal(catalog.forModality("stream").length, 1)
  assert.equal(catalog.forModality("text").length, 2)
  assert.equal(catalog.get("gpt-5.4").is_default, true)
})

test("AIInvoker.model(string) builds a correct ModelHandle", async () => {
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "town_demo",
    user_token: "ub_test",
    fetch: async () => json({ ok: true }),
  })
  const handle = client.ai.model("gpt-5.4")
  assert.equal(handle.id, "gpt-5.4")
  assert.equal(handle.name, "gpt-5.4")
  assert.equal(handle.url(), "https://api.example.com/base/v1/ai")
  assert.equal(handle.token, "ub_test")
})

test("AIInvoker.stream() returns parsed chunks", async () => {
  const chunks = [{ type: "start", messageId: "msg_1" }, { type: "text-delta", id: "t1", delta: "hi" }, { type: "finish" }]
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/", town_id: "town_demo", user_token: "ub_test",
    fetch: async () => streamResponse(chunks),
  })
  const stream = await client.ai.stream({ prompt: "hi" })
  const received = []; const reader = stream.getReader()
  while (true) { const { done, value } = await reader.read(); if (done) break; received.push(value) }
  assert.deepEqual(received, chunks)
})

test("User City listServices()", async () => {
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    user_token: "t",
    fetch: async () => json({
      items: [
        { id: "ai", name: "AI", env: [] },
        { id: "notes", name: "Notes", env: [{ key: "NOTES_KEY", description: "Notes API key", required: true }] },
      ],
    }),
  })
  assert.deepEqual(await client.listServices(), [
    { id: "ai", name: "AI", env: [] },
    { id: "notes", name: "Notes", env: [{ key: "NOTES_KEY", description: "Notes API key", required: true }] },
  ])
})

test("User City service() → ServiceInvoker", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/", town_id: "p", user_token: "t", fetch: async (url, init) => { requests.push({ url, init }); return json({ ok: true }) } })
  const result = await client.service("notes").action("create").invoke({ title: "hello" })
  assert.deepEqual(result, { ok: true })
  assert.equal(requests[0].url, "https://api.example.com/base/v1/notes/create")
  assert.deepEqual(JSON.parse(requests[0].init.body), { title: "hello", town_id: "p" })
})

test("ServiceClient.get() appends query params for GET actions", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    user_token: "t",
    fetch: async (url, init) => { requests.push({ url, init }); return json({ ok: true }) },
  })
  const result = await client.service("accounts").get("oauth/result", { state: "abc_123" })
  assert.deepEqual(result, { ok: true })
  assert.equal(requests[0].url, "https://api.example.com/base/v1/accounts/oauth/result?state=abc_123")
  assert.equal(requests[0].init.method, "GET")
})

test("User City payment.methods() reads the unified payment directory", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    fetch: async (url, init) => {
      requests.push({ url, init })
      return json({
        items: [
          {
            id: "stripe",
            type: "checkout",
            enabled: true,
            label: "Stripe",
            service: "payment.stripe",
            action: "checkout/create",
            requires_user: true,
            currency: "usd",
          },
        ],
      })
    },
  })

  assert.deepEqual(await client.payment.methods(), [
    {
      id: "stripe",
      type: "checkout",
      enabled: true,
      label: "Stripe",
      service: "payment.stripe",
      action: "checkout/create",
      requires_user: true,
      currency: "usd",
    },
  ])
  assert.equal(requests[0].url, "https://api.example.com/base/v1/payment/methods")
  assert.equal(requests[0].init.method, "GET")
})

test("User City payment.method(id).invoke() dispatches to the concrete payment service", async () => {
  const requests = []
  const client = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    user_token: "t",
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (url.endsWith("/v1/payment/methods")) {
        return json({
          items: [
            {
              id: "stripe",
              type: "checkout",
              enabled: true,
              label: "Stripe",
              service: "payment.stripe",
              action: "checkout/create",
              requires_user: true,
              currency: "usd",
            },
          ],
        })
      }
      return json({ checkout_url: "https://checkout.stripe.test/session_123" })
    },
  })

  const method = client.payment.method("stripe")
  assert.equal(method.id, "stripe")
  assert.equal((await method.describe()).service, "payment.stripe")
  assert.deepEqual(
    await method.invoke({ topup_id: "topup_demo" }),
    { checkout_url: "https://checkout.stripe.test/session_123" },
  )

  assert.equal(requests[1].url, "https://api.example.com/base/v1/payment.stripe/checkout/create")
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    topup_id: "topup_demo",
    town_id: "p",
  })
})

test("User City payment.method(id).invoke() rejects disabled or user-required methods early", async () => {
  const disabledClient = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    fetch: async () => json({
      items: [
        {
          id: "stripe",
          type: "checkout",
          enabled: false,
          label: "Stripe",
          service: "payment.stripe",
          action: "checkout/create",
          requires_user: true,
          currency: "usd",
          reason: "not_configured",
        },
      ],
    }),
  })

  await assert.rejects(
    disabledClient.payment.method("stripe").invoke({ topup_id: "topup_demo" }),
    /payment method "stripe" is disabled: not_configured/,
  )

  const guestClient = new City({
    role: "user",
    city_url: "https://api.example.com/base/",
    town_id: "p",
    fetch: async () => json({
      items: [
        {
          id: "stripe",
          type: "checkout",
          enabled: true,
          label: "Stripe",
          service: "payment.stripe",
          action: "checkout/create",
          requires_user: true,
          currency: "usd",
        },
      ],
    }),
  })

  await assert.rejects(
    guestClient.payment.method("stripe").invoke({ topup_id: "topup_demo" }),
    /user_token is required for payment method "stripe"/,
  )
})

test("Admin City service() uses the shared /v1 route prefix", async () => {
  const requests = []
  const admin = new City({
    role: "admin",
    city_url: "http://localhost:3001/", admin_secret_key: "sk", fetch: async (url, init) => { requests.push({ url, init }); return json({ ok: true }) } })
  const result = await admin.service("usage").action("report").invoke({ range: "today" })
  assert.deepEqual(result, { ok: true })
  assert.equal(requests[0].url, "http://localhost:3001/v1/usage/report")
  assert.equal(requests[0].init.headers.authorization, "Bearer sk")
})

test("Admin City env list / catalog / upsert / remove", async () => {
  const requests = []
  const admin = new City({
    role: "admin",
    city_url: "http://localhost:3001/", admin_secret_key: "sk", fetch: async (url, init) => {
    requests.push({ url, init })
    if (url.endsWith("/v1/env/list")) return json({ items: [{ key: "K", value: "V", source: "database" }] })
    if (url.endsWith("/v1/env/catalog")) {
      return json({
        items: [
          {
            id: "accounts",
            name: "Accounts",
            env: [{ key: "BETTER_AUTH_SECRET", description: "secret", required: true, configured: true, value_preview: "better...cret" }],
          },
        ],
      })
    }
    return json({ success: true })
  }})
  const items = await admin.env.list()
  assert.deepEqual(items, [{ key: "K", value: "V", source: "database" }])
  const catalog = await admin.env.catalog()
  assert.deepEqual(catalog, [
    {
      id: "accounts",
      name: "Accounts",
      env: [{ key: "BETTER_AUTH_SECRET", description: "secret", required: true, configured: true, value_preview: "better...cret" }],
    },
  ])
  await admin.env.upsert({ key: "K2", value: "V2" })
  assert.equal(requests[2].url, "http://localhost:3001/v1/env/upsert")
  await admin.env.remove("K2")
  assert.equal(requests[3].url, "http://localhost:3001/v1/env/remove")
})

test("Admin City towns CRUD + tokens.apply", async () => {
  const requests = []; const p = { town_id: "p1", name: "Demo", status: "active", created_at: "t", updated_at: "t" }
  const admin = new City({
    role: "admin",
    city_url: "http://localhost:3001/", admin_secret_key: "sk", fetch: async (url, init) => {
    requests.push({ url, init })
    if (url.endsWith("/v1/towns/list")) return json({ items: [p] })
    if (url.endsWith("/v1/towns/create")) return json(p)
    if (url.endsWith("/v1/towns/tokens/apply")) return json({ user_token: "ub_test", town_id: "p1", user_id: "u1", expires_at: "2026-01-01T00:00:00.000Z" })
    return json({ success: true })
  }})
  assert.deepEqual(await admin.towns.list(), [p])
  assert.equal((await admin.towns.create({ name: "Demo" })).town_id, "p1")
  await admin.towns.pause("p1")
  assert.equal(requests[2].url, "http://localhost:3001/v1/towns/pause")
  assert.deepEqual(await admin.towns.tokens.apply({ town_id: "p1", user_id: "u1" }), {
    user_token: "ub_test",
    town_id: "p1",
    user_id: "u1",
    expires_at: "2026-01-01T00:00:00.000Z",
  })
})

test("Admin City listServices() / listModels() / instruction()", async () => {
  const requests = []
  const admin = new City({
    role: "admin",
    city_url: "http://localhost:3001/",
    admin_secret_key: "sk",
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (url.endsWith("/v1/services")) {
        return json({
          items: [
            { id: "ai", name: "AI", env: [] },
            { id: "accounts", name: "Accounts", env: [{ key: "SMTP_URL", description: "smtp", required: true }] },
          ],
        })
      }
      if (url.endsWith("/v1/ai/models")) {
        return json({
          items: [
            {
              id: "gpt-5.4",
              name: "GPT-5.4",
              description: "model",
              modalities: ["text", "stream"],
              tags: [],
              meta: {},
              env_requirements: [{ key: "OPENAI_API_KEY", description: "key", required: true }],
              default_modes: ["text"],
            },
          ],
        })
      }
      if (url.endsWith("/v1/city/instruction")) {
        return text("CityBase instruction document")
      }
      return json({ ok: true })
    },
  })

  assert.deepEqual(await admin.listServices(), [
    { id: "ai", name: "AI", env: [] },
    { id: "accounts", name: "Accounts", env: [{ key: "SMTP_URL", description: "smtp", required: true }] },
  ])
  assert.deepEqual(await admin.listModels(), [
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      description: "model",
      modalities: ["text", "stream"],
      tags: [],
      meta: {},
      env_requirements: [{ key: "OPENAI_API_KEY", description: "key", required: true }],
      default_modes: ["text"],
    },
  ])
  assert.equal(await admin.instruction(), "CityBase instruction document")
  assert.equal(requests[2].init.headers.authorization, "Bearer sk")
})

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, body: null, async json() { return body }, async text() { return JSON.stringify(body) } }
}

function text(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, body: null, async json() { return body }, async text() { return body } }
}

function streamResponse(chunks) {
  const e = new TextEncoder()
  return { ok: true, status: 200, body: new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(e.encode(`data: ${JSON.stringify(chunk)}\n\n`)); c.close() } }), async json() { return {} }, async text() { return "" } }
}
