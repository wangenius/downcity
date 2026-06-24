import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Federation } from "@downcity/city"
import { createSqliteDb } from "../../sqlite-db.mjs"
import { dodoPaymentProvider, PaymentService } from "../../../../bin/index.js"

test("paymentService lists enabled Dodo payment method for guests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-dodo-methods-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })
    base.use(new PaymentService({
      providers: [
        dodoPaymentProvider({
          api_key: "dodo_test",
          product_id: "pdt_test",
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "dodo",
        type: "checkout",
        enabled: true,
        label: "Dodo Payments",
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

test("paymentService creates Dodo checkout sessions and finishes topups through webhook", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-dodo-service-"))
  const dodoStub = await createDodoStub()

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })
    const balance = createBalanceBridge()
    base.use(new PaymentService({
      readTopup: (id) => balance.readTopup(id),

      finishTopup: (id, extra) => balance.finishTopup(id, extra),
      providers: [
        dodoPaymentProvider({
          api_key: "dodo_test",
          product_id: "pdt_test",
          environment: "test_mode",
          api_base_url: dodoStub.baseURL,
          currency: "usd",
        }),
      ],
    }))

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")
    await base.getService("env")._env.upsert({ key: "DOWNCITY_CITY_BASE_URL", value: "https://base.example.com/" })
    const city = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/cities/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/cities/tokens/apply",
      body: { city_id: city.city_id, user_id: "user_1" },
    }))).json()

    const topup = await balance.createTopup("user_1", 50, { note: "recharge" })
    const checkoutResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "dodo", topup_id: topup.topup_id },
    }))
    assert.equal(checkoutResponse.status, 200)
    const checkout = await checkoutResponse.json()
    assert.equal(checkout.status, "pending")
    assert.equal(checkout.provider, "dodo")
    assert.equal(checkout.provider_session_id, "cs_dodo_test")
    assert.equal(checkout.provider_payment_id, "pay_dodo_test")
    assert.equal(checkout.checkout_url, "https://checkout.dodo.test/cs_dodo_test")
    assert.equal(dodoStub.lastBody().product_cart[0].product_id, "pdt_test")
    assert.equal(dodoStub.lastBody().return_url, "https://base.example.com/v1/payment/redirect/success")
    assert.equal(dodoStub.lastBody().cancel_url, "https://base.example.com/v1/payment/redirect/cancel")
    assert.equal(dodoStub.lastBody().metadata.payment_id, checkout.payment_id)

    const duplicateCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "dodo", topup_id: topup.topup_id },
    }))).json()
    assert.equal(duplicateCheckout.payment_id, checkout.payment_id)

    const completedPayload = JSON.stringify({
      id: "evt_dodo_completed",
      type: "payment.succeeded",
      data: {
        payment_id: "pay_dodo_test",
        checkout_session_id: "cs_dodo_test",
        metadata: {
          payment_id: checkout.payment_id,
          topup_id: topup.topup_id,
          user_id: "user_1",
        },
      },
    })
    const webhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=dodo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: completedPayload,
    }))
    assert.equal(webhookResponse.status, 200)
    assert.deepEqual(await webhookResponse.json(), {
      received: true,
      event_id: "dodo:evt_dodo_completed",
      provider: "dodo",
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
    assert.equal(myPayments.items[0].status, "paid")
    assert.equal(myPayments.items[0].provider, "dodo")
    assert.equal(myPayments.items[0].provider_payment_id, "pay_dodo_test")
  } finally {
    await dodoStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

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

function userRequest({ token, path: pathname, method = "POST", body }) {
  return new Request(`http://localhost${pathname}`, {
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

async function createDodoStub() {
  let lastBody = null

  const server = http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/checkouts") {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
      assert.equal(request.headers.authorization, "Bearer dodo_test")
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        session_id: "cs_dodo_test",
        payment_id: "pay_dodo_test",
        checkout_url: "https://checkout.dodo.test/cs_dodo_test",
      }))
      return
    }

    response.writeHead(404, { "content-type": "application/json" })
    response.end(JSON.stringify({ message: "not found" }))
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0

  return {
    baseURL: `http://127.0.0.1:${port}`,
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
      const normalizedAmount = amount * 1_000_000
      const topup = {
        topup_id: `topup_${Math.random().toString(36).slice(2, 10)}`,
        user_id: userId,
        amount: normalizedAmount,
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
      const balance = balances.get(userId) || 0
      return {
        user_id: userId,
        balance,
      }
    },
  }
}
