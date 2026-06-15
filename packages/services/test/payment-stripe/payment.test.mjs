import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { CityBase } from "@downcity/city"
import { createSqliteDb } from "./sqlite-db.mjs"
import { paymentService, stripePaymentProvider } from "../../bin/index.js"

test("paymentService lists enabled payment methods for guests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-methods-"))

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    base.use(paymentService({
      providers: [
        stripePaymentProvider({
          secret_key: "sk_test",
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "stripe",
        type: "checkout",
        enabled: true,
        label: "Stripe",
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

test("paymentService marks payment methods as disabled when Stripe is not configured", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-methods-disabled-"))

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    base.use(paymentService({
      providers: [
        stripePaymentProvider({
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "stripe",
        type: "checkout",
        enabled: false,
        label: "Stripe",
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-"))
  const stripeStub = await createStripeStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        stripePaymentProvider({
          secret_key: "sk_test",
          webhook_secret: "whsec_test",
          api_base_url: stripeStub.baseURL,
          item_name: "Downcity Recharge",
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
    assert.equal(topup.status, "pending")

    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: {
        method_id: "stripe",
        topup_id: topup.topup_id,
      },
    }))
    assert.equal(checkoutResponse.status, 200)
    const checkout = await checkoutResponse.json()
    assert.equal(checkout.status, "pending")
    assert.equal(checkout.topup_id, topup.topup_id)
    assert.equal(checkout.provider, "stripe")
    assert.equal(checkout.provider_session_id, "cs_test_checkout")
    assert.equal(checkout.checkout_url, "https://checkout.stripe.test/cs_test_checkout")
    assert.equal(stripeStub.lastParams()?.get("success_url"), "https://base.example.com/v1/payment/redirect/success")
    assert.equal(stripeStub.lastParams()?.get("cancel_url"), "https://base.example.com/v1/payment/redirect/cancel")

    const duplicateCheckoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: {
        method_id: "stripe",
        topup_id: topup.topup_id,
      },
    }))
    assert.equal(duplicateCheckoutResponse.status, 200)
    const duplicateCheckout = await duplicateCheckoutResponse.json()
    assert.equal(duplicateCheckout.payment_id, checkout.payment_id)

    const invalidWebhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1700000000,v1=bad",
      },
      body: JSON.stringify({
        id: "evt_invalid",
        type: "checkout.session.completed",
      }),
    }))
    assert.equal(invalidWebhookResponse.status, 400)

    const completedPayload = JSON.stringify({
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_checkout",
          payment_intent: "pi_test_payment",
          client_reference_id: topup.topup_id,
          metadata: {
            payment_id: checkout.payment_id,
            topup_id: topup.topup_id,
            user_id: "user_1",
          },
        },
      },
    })
    const webhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(completedPayload, "whsec_test"),
      },
      body: completedPayload,
    }))
    assert.equal(webhookResponse.status, 200)
    assert.deepEqual(await webhookResponse.json(), {
      received: true,
      event_id: "stripe:evt_checkout_completed",
      provider: "stripe",
      sync_status: "applied",
    })

    const afterTopup = await balance.read("user_1")
    assert.equal(afterTopup.balance, 50_000_000)

    const repeatedWebhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(completedPayload, "whsec_test"),
      },
      body: completedPayload,
    }))
    assert.equal(repeatedWebhookResponse.status, 200)
    assert.deepEqual(await repeatedWebhookResponse.json(), {
      received: true,
      event_id: "stripe:evt_checkout_completed",
      provider: "stripe",
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
    assert.equal(myPayments.items[0].provider, "stripe")
    assert.equal(myPayments.items[0].provider_payment_id, "pi_test_payment")

    const allPaymentsResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/payment/payments",
      method: "GET",
    }))
    assert.equal(allPaymentsResponse.status, 200)
    const allPayments = await allPaymentsResponse.json()
    assert.equal(allPayments.items.length, 1)
  } finally {
    await stripeStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService falls back to DOWNCITY_CITY_BASE_URL for redirect URLs and exposes HTML pages", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-redirect-"))
  const stripeStub = await createStripeStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        stripePaymentProvider({
          secret_key: "sk_test",
          webhook_secret: "whsec_test",
          api_base_url: stripeStub.baseURL,
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

    const topup = await balance.createTopup("user_3", 80, { note: "redirect fallback" })
    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "stripe", topup_id: topup.topup_id },
    }))
    assert.equal(checkoutResponse.status, 200)
    assert.equal(
      stripeStub.lastParams()?.get("success_url"),
      "https://base.example.com/v1/payment/redirect/success",
    )
    assert.equal(
      stripeStub.lastParams()?.get("cancel_url"),
      "https://base.example.com/v1/payment/redirect/cancel",
    )

    const successPage = await base.handleRequest(new Request("https://base.example.com/v1/payment/redirect/success"))
    assert.equal(successPage.status, 200)
    assert.match(successPage.headers.get("content-type") || "", /^text\/html\b/)
    assert.match(await successPage.text(), /Payment completed/)

    const cancelPage = await base.handleRequest(new Request("https://base.example.com/v1/payment/redirect/cancel"))
    assert.equal(cancelPage.status, 200)
    assert.match(cancelPage.headers.get("content-type") || "", /^text\/html\b/)
    assert.match(await cancelPage.text(), /Payment canceled/)
  } finally {
    await stripeStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService derives redirect URLs from request origin without base-url env", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-request-origin-"))
  const stripeStub = await createStripeStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        stripePaymentProvider({
          secret_key: "sk_test",
          webhook_secret: "whsec_test",
          api_base_url: stripeStub.baseURL,
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
      body: { town_id: town.town_id, user_id: "user_4" },
    }))).json()

    const topup = await balance.createTopup("user_4", 120, { note: "request origin fallback" })
    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "stripe", topup_id: topup.topup_id },
      origin: "https://runtime.example.com",
    }))
    assert.equal(checkoutResponse.status, 200)
    assert.equal(
      stripeStub.lastParams()?.get("success_url"),
      "https://runtime.example.com/v1/payment/redirect/success",
    )
    assert.equal(
      stripeStub.lastParams()?.get("cancel_url"),
      "https://runtime.example.com/v1/payment/redirect/cancel",
    )
  } finally {
    await stripeStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("paymentService marks failed and expired payments without crediting balance", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-payment-service-status-"))
  const stripeStub = await createStripeStub()

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        stripePaymentProvider({
          secret_key: "sk_test",
          webhook_secret: "whsec_test",
          api_base_url: stripeStub.baseURL,
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
      body: { town_id: town.town_id, user_id: "user_2" },
    }))).json()

    const expiredTopup = await balance.createTopup("user_2", 30, { note: "expired" })
    const expiredCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "stripe", topup_id: expiredTopup.topup_id },
    }))).json()

    const expiredPayload = JSON.stringify({
      id: "evt_checkout_expired",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_test_checkout",
          client_reference_id: expiredTopup.topup_id,
          metadata: {
            payment_id: expiredCheckout.payment_id,
            topup_id: expiredTopup.topup_id,
            user_id: "user_2",
          },
        },
      },
    })
    const expiredResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(expiredPayload, "whsec_test"),
      },
      body: expiredPayload,
    }))
    assert.equal(expiredResponse.status, 200)

    const failedTopup = await balance.createTopup("user_2", 45, { note: "failed" })
    stripeStub.setNextSession({
      id: "cs_test_failed",
      url: "https://checkout.stripe.test/cs_test_failed",
      payment_intent: "pi_test_failed",
    })
    const failedCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "stripe", topup_id: failedTopup.topup_id },
    }))).json()

    const failedPayload = JSON.stringify({
      id: "evt_payment_failed",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_test_failed",
          metadata: {
            payment_id: failedCheckout.payment_id,
            topup_id: failedTopup.topup_id,
            user_id: "user_2",
          },
        },
      },
    })
    const failedResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(failedPayload, "whsec_test"),
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
    assert.equal((await balance.read("user_2")).balance, 0)
  } finally {
    await stripeStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

function stripeSignature(payload, secret) {
  const timestamp = "1700000000"
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex")
  return `t=${timestamp},v1=${signature}`
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

async function createStripeStub() {
  let nextSession = {
    id: "cs_test_checkout",
    url: "https://checkout.stripe.test/cs_test_checkout",
    payment_intent: "",
  }
  let lastParams = null

  const server = http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/checkout/sessions") {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString("utf8")
      const params = new URLSearchParams(body)
      assert.equal(params.get("mode"), "payment")
      lastParams = new URLSearchParams(body)
      const current = nextSession
      nextSession = {
        id: current.id,
        url: current.url,
        payment_intent: current.payment_intent,
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        id: current.id,
        url: current.url,
        payment_intent: current.payment_intent,
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
    lastParams() {
      return lastParams ? new URLSearchParams(lastParams.toString()) : null
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
