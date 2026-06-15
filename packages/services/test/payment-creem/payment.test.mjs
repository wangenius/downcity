import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { CityBase } from "@downcity/city"
import { createSqliteDb } from "../payment-stripe/sqlite-db.mjs"
import { creemPaymentProvider, paymentService } from "../../bin/index.js"

test("paymentService lists enabled Creem payment method for guests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-creem-methods-"))

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    base.use(paymentService({
      providers: [
        creemPaymentProvider({
          api_key: "creem_test",
          product_id: "prod_test",
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "creem",
        type: "checkout",
        enabled: true,
        label: "Creem",
        service: "payment",
        action: "checkout/create",
        requires_user: true,
        currency: "usd",
      }],
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService marks Creem disabled when required config is missing", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-creem-methods-disabled-"))

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    base.use(paymentService({
      providers: [
        creemPaymentProvider({
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "creem",
        type: "checkout",
        enabled: false,
        label: "Creem",
        service: "payment",
        action: "checkout/create",
        requires_user: true,
        currency: "usd",
        reason: "not_configured",
      }],
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService creates checkout sessions and finishes topups through webhook", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-creem-service-"))
  const creemStub = await createCreemStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        creemPaymentProvider({
          api_key: "creem_test",
          product_id: "prod_test",
          webhook_secret: "whsec_creem",
          api_base_url: creemStub.baseURL,
          currency: "usd",
        }),
      ],
    }))

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")
    await base.getService("env")._env.upsert({ key: "DOWNCITY_CITY_BASE_URL", value: "https://base.example.com/" })

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_1" },
    }))).json()

    const topup = await balance.createTopup("user_1", 50, { note: "recharge" })
    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: {
        method_id: "creem",
        topup_id: topup.topup_id,
      },
    }))
    assert.equal(checkoutResponse.status, 200)
    const checkout = await checkoutResponse.json()
    assert.equal(checkout.status, "pending")
    assert.equal(checkout.topup_id, topup.topup_id)
    assert.equal(checkout.provider, "creem")
    assert.equal(checkout.provider_session_id, "ch_test_checkout")
    assert.equal(checkout.checkout_url, "https://checkout.creem.test/ch_test_checkout")
    assert.equal(creemStub.lastBody().product_id, "prod_test")
    assert.equal(creemStub.lastBody().success_url, "https://base.example.com/v1/payment/redirect/success")
    assert.equal(creemStub.lastBody().request_id, checkout.payment_id)
    assert.equal(creemStub.lastBody().metadata.topup_id, topup.topup_id)

    const duplicateCheckoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: {
        method_id: "creem",
        topup_id: topup.topup_id,
      },
    }))
    assert.equal(duplicateCheckoutResponse.status, 200)
    const duplicateCheckout = await duplicateCheckoutResponse.json()
    assert.equal(duplicateCheckout.payment_id, checkout.payment_id)

    const invalidWebhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": "bad",
      },
      body: JSON.stringify({
        id: "evt_invalid",
        eventType: "checkout.completed",
      }),
    }))
    assert.equal(invalidWebhookResponse.status, 400)

    const completedPayload = JSON.stringify({
      id: "evt_checkout_completed",
      eventType: "checkout.completed",
      object: {
        id: "ch_test_checkout",
        order_id: "ord_test_order",
        metadata: {
          payment_id: checkout.payment_id,
          topup_id: topup.topup_id,
          user_id: "user_1",
        },
      },
    })
    const webhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": creemSignature(completedPayload, "whsec_creem"),
      },
      body: completedPayload,
    }))
    assert.equal(webhookResponse.status, 200)
    assert.deepEqual(await webhookResponse.json(), {
      received: true,
      event_id: "creem:evt_checkout_completed",
      provider: "creem",
      sync_status: "applied",
    })

    const afterTopup = await balance.read("user_1")
    assert.equal(afterTopup.balance, 50_000_000)

    const repeatedWebhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": creemSignature(completedPayload, "whsec_creem"),
      },
      body: completedPayload,
    }))
    assert.equal(repeatedWebhookResponse.status, 200)
    assert.deepEqual(await repeatedWebhookResponse.json(), {
      received: true,
      event_id: "creem:evt_checkout_completed",
      provider: "creem",
      sync_status: "applied",
    })
    assert.equal((await balance.read("user_1")).balance, 50_000_000)

    const myPaymentsResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/payments/me",
      method: "GET",
    }))
    assert.equal(myPaymentsResponse.status, 200)
    const myPayments = await myPaymentsResponse.json()
    assert.equal(myPayments.items.length, 1)
    assert.equal(myPayments.items[0].status, "paid")
    assert.equal(myPayments.items[0].provider, "creem")
    assert.equal(myPayments.items[0].provider_order_id, "ord_test_order")

    const allPaymentsResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/payment/payments",
      method: "GET",
    }))
    assert.equal(allPaymentsResponse.status, 200)
    const allPayments = await allPaymentsResponse.json()
    assert.equal(allPayments.items.length, 1)
  } finally {
    await creemStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService falls back to request origin for redirect URLs and exposes HTML pages", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-creem-redirect-"))
  const creemStub = await createCreemStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        creemPaymentProvider({
          api_key: "creem_test",
          product_id: "prod_test",
          webhook_secret: "whsec_creem",
          api_base_url: creemStub.baseURL,
        }),
      ],
    }))

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_2" },
    }))).json()

    const topup = await balance.createTopup("user_2", 80, { note: "redirect fallback" })
    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "creem", topup_id: topup.topup_id },
      origin: "https://runtime.example.com",
    }))
    assert.equal(checkoutResponse.status, 200)
    assert.equal(
      creemStub.lastBody().success_url,
      "https://runtime.example.com/v1/payment/redirect/success",
    )
    const successPage = await base.handleRequest(new Request("https://runtime.example.com/v1/payment/redirect/success"))
    assert.equal(successPage.status, 200)
    assert.match(successPage.headers.get("content-type") || "", /^text\/html\b/)
    assert.match(await successPage.text(), /Payment completed/)

    const cancelPage = await base.handleRequest(new Request("https://runtime.example.com/v1/payment/redirect/cancel"))
    assert.equal(cancelPage.status, 200)
    assert.match(cancelPage.headers.get("content-type") || "", /^text\/html\b/)
    assert.match(await cancelPage.text(), /Payment canceled/)
  } finally {
    await creemStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService marks failed and expired payments without crediting balance", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-creem-status-"))
  const creemStub = await createCreemStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        creemPaymentProvider({
          api_key: "creem_test",
          product_id: "prod_test",
          webhook_secret: "whsec_creem",
          api_base_url: creemStub.baseURL,
        }),
      ],
    }))

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")
    await base.getService("env")._env.upsert({ key: "DOWNCITY_CITY_BASE_URL", value: "https://base.example.com/" })

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_3" },
    }))).json()

    const expiredTopup = await balance.createTopup("user_3", 30, { note: "expired" })
    const expiredCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "creem", topup_id: expiredTopup.topup_id },
    }))).json()

    const expiredPayload = JSON.stringify({
      id: "evt_checkout_expired",
      eventType: "checkout.expired",
      object: {
        id: "ch_test_checkout",
        metadata: {
          payment_id: expiredCheckout.payment_id,
          topup_id: expiredTopup.topup_id,
          user_id: "user_3",
        },
      },
    })
    const expiredResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": creemSignature(expiredPayload, "whsec_creem"),
      },
      body: expiredPayload,
    }))
    assert.equal(expiredResponse.status, 200)

    const failedTopup = await balance.createTopup("user_3", 45, { note: "failed" })
    creemStub.setNextSession({
      id: "ch_test_failed",
      checkout_url: "https://checkout.creem.test/ch_test_failed",
    })
    const failedCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "creem", topup_id: failedTopup.topup_id },
    }))).json()

    const failedPayload = JSON.stringify({
      id: "evt_checkout_failed",
      eventType: "checkout.failed",
      object: {
        id: "ch_test_failed",
        order_id: "ord_test_failed",
        metadata: {
          payment_id: failedCheckout.payment_id,
          topup_id: failedTopup.topup_id,
          user_id: "user_3",
        },
      },
    })
    const failedResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": creemSignature(failedPayload, "whsec_creem"),
      },
      body: failedPayload,
    }))
    assert.equal(failedResponse.status, 200)

    const paymentsResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/payment/payments",
      method: "GET",
    }))
    const payments = await paymentsResponse.json()
    const expiredRecord = payments.items.find((item) => item.payment_id === expiredCheckout.payment_id)
    const failedRecord = payments.items.find((item) => item.payment_id === failedCheckout.payment_id)
    assert.equal(expiredRecord.status, "expired")
    assert.equal(failedRecord.status, "failed")
    assert.equal((await balance.read("user_3")).balance, 0)
  } finally {
    await creemStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

function creemSignature(payload, secret) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
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

function userRequest({ token, path: pathname, method = "POST", body, origin = "http://localhost" }) {
  return new Request(`${origin}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function readEnvValue(base, key) {
  const envTable = await base.table("env")
  const rows = await envTable.select({ key })
  return rows[0]?.value ?? ""
}

async function createCreemStub() {
  let nextSession = {
    id: "ch_test_checkout",
    checkout_url: "https://checkout.creem.test/ch_test_checkout",
  }
  let lastBody = null

  const server = http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/checkouts") {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString("utf8")
      lastBody = JSON.parse(body || "{}")
      assert.equal(request.headers["x-api-key"], "creem_test")
      assert.equal(lastBody.product_id, "prod_test")
      const current = nextSession
      nextSession = {
        id: current.id,
        checkout_url: current.checkout_url,
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        id: current.id,
        checkout_url: current.checkout_url,
      }))
      return
    }

    response.writeHead(404, { "content-type": "application/json" })
    response.end(JSON.stringify({ error: { message: "not found" } }))
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0

  return {
    baseURL: `http://127.0.0.1:${port}`,
    setNextSession(session) {
      nextSession = session
    },
    lastBody() {
      return lastBody
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}

function createBalanceBridge() {
  const topups = new Map()
  const balances = new Map()

  return {
    async createTopup(userId, amount, extra = {}) {
      const topup = {
        topup_id: `topup_${Math.random().toString(36).slice(2, 10)}`,
        user_id: userId,
        amount,
        status: "pending",
        note: extra.note || "",
      }
      topups.set(topup.topup_id, topup)
      return { ...topup }
    },
    async readTopup(topupId) {
      const topup = topups.get(topupId)
      if (!topup) throw new Error(`topup not found: ${topupId}`)
      return { ...topup }
    },
    async finishTopup(topupId) {
      const topup = topups.get(topupId)
      if (!topup) throw new Error(`topup not found: ${topupId}`)
      if (topup.status !== "pending") throw new Error(`topup is already ${topup.status}`)
      topup.status = "paid"
      balances.set(topup.user_id, (balances.get(topup.user_id) || 0) + topup.amount)
      return { ...topup }
    },
    async read(userId) {
      const balance = (balances.get(userId) || 0) * 1_000_000
      return {
        user_id: userId,
        balance,
        balance_microcredits: balance,
      }
    },
  }
}
