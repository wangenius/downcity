import assert from "node:assert/strict"
import { createPrivateKey, createSign, generateKeyPairSync } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { CityBase } from "@downcity/city"
import { createSqliteDb } from "../payment-stripe/sqlite-db.mjs"
import { paymentService, waffoPaymentProvider } from "../../bin/index.js"

test("paymentService lists enabled Waffo payment method for guests", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-waffo-methods-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    base.use(paymentService({
      providers: [
        waffoPaymentProvider({
          merchant_id: "MER_6gyg0Q5asJBoY5GSNmZt7P",
          private_key: "private",
          product_id: "PROD_1234567890123456789012",
          currency: "usd",
        }),
      ],
    }))

    await base.health()

    const response = await base.handleRequest(new Request("http://localhost/v1/payment/methods"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        id: "waffo",
        type: "checkout",
        enabled: true,
        label: "Waffo Pancake",
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

test("paymentService creates Waffo checkout sessions and finishes topups through webhook", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-waffo-service-"))
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const privateKey = keys.privateKey.export({ type: "pkcs1", format: "pem" })
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" })
  const waffoStub = await createWaffoStub()

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db, dialect: "sqlite", raw: db.raw })
    const balance = createBalanceBridge()
    base.use(paymentService({
      balance,
      providers: [
        waffoPaymentProvider({
          merchant_id: "MER_6gyg0Q5asJBoY5GSNmZt7P",
          private_key: privateKey,
          product_id: "PROD_1234567890123456789012",
          webhook_public_key: publicKey,
          environment: "test",
          api_base_url: waffoStub.baseURL,
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
      body: { method_id: "waffo", topup_id: topup.topup_id },
    }))
    assert.equal(checkoutResponse.status, 200)
    const checkout = await checkoutResponse.json()
    assert.equal(checkout.status, "pending")
    assert.equal(checkout.provider, "waffo")
    assert.equal(checkout.provider_session_id, "ses_waffo_test")
    assert.equal(checkout.checkout_url, "https://checkout.waffo.test/ses_waffo_test")
    assert.equal(waffoStub.lastBody().productId, "PROD_1234567890123456789012")
    assert.equal(waffoStub.lastBody().successUrl, "https://base.example.com/v1/payment/redirect/success")
    assert.equal(waffoStub.lastBody().orderMerchantExternalId, checkout.payment_id)
    assert.equal(waffoStub.lastBody().metadata.topup_id, topup.topup_id)

    const duplicateCheckout = await (await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/payment/checkout/create",
      body: { method_id: "waffo", topup_id: topup.topup_id },
    }))).json()
    assert.equal(duplicateCheckout.payment_id, checkout.payment_id)

    const completedPayload = JSON.stringify({
      id: "evt_waffo_completed",
      timestamp: new Date().toISOString(),
      eventType: "order.completed",
      eventId: "PAY_1234567890123456789012",
      storeId: "STO_1234567890123456789012",
      storeName: "Demo",
      mode: "test",
      data: {
        orderId: "ORD_1234567890123456789012",
        paymentId: "PAY_1234567890123456789012",
        buyerEmail: "user@example.com",
        orderMerchantExternalId: checkout.payment_id,
        currency: "USD",
        amount: "50",
        taxAmount: "0",
        productName: "Credits",
        paymentStatus: "succeeded",
        orderMetadata: {
          topup_id: topup.topup_id,
        },
      },
    })
    const webhookResponse = await base.handleRequest(new Request("http://localhost/v1/payment/webhook?provider=waffo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-waffo-signature": waffoSignature(completedPayload, privateKey),
      },
      body: completedPayload,
    }))
    assert.equal(webhookResponse.status, 200)
    assert.deepEqual(await webhookResponse.json(), {
      received: true,
      event_id: "waffo:evt_waffo_completed",
      provider: "waffo",
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
    assert.equal(myPayments.items[0].provider, "waffo")
    assert.equal(myPayments.items[0].provider_order_id, "ORD_1234567890123456789012")
    assert.equal(myPayments.items[0].provider_payment_id, "PAY_1234567890123456789012")
  } finally {
    await waffoStub.close()
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

function waffoSignature(payload, privateKey) {
  const timestamp = String(Date.now())
  const signer = createSign("RSA-SHA256")
  signer.update(`${timestamp}.${payload}`)
  const signature = signer.sign(createPrivateKey(privateKey), "base64")
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

async function createWaffoStub() {
  let lastBody = null

  const server = http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/v1/actions/checkout/create-session") {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
      assert.equal(request.headers["x-merchant-id"], "MER_6gyg0Q5asJBoY5GSNmZt7P")
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        data: {
          sessionId: "ses_waffo_test",
          checkoutUrl: "https://checkout.waffo.test/ses_waffo_test",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      }))
      return
    }

    response.writeHead(404, { "content-type": "application/json" })
    response.end(JSON.stringify({ errors: [{ message: "not found", layer: "sdk" }] }))
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
