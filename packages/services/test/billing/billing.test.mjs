import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { CityBase, AIService } from "@downcity/city"
import { createSqliteDb } from "../balance/sqlite-db.mjs"
import { BalanceService, BillingService, UsageService } from "../../bin/index.js"

test("billingService settles AI metering into balance charges", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-billing-service-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db })

    const balance = new BalanceService({
      init: 1,
    })
    base.use(balance)
    base.use(new UsageService())
    base.use(new BillingService({
      balance,
      pricing_rules: [{
        rule_id: "ai_text_test",
        service_id: "ai",
        action_id: "text",
        model_id: "gpt-test",
        request_microcredits: 10_000,
        input_token_microcredits: 2,
        output_token_microcredits: 4,
      }],
    }))

    const ai = new AIService()
    ai.use({
      id: "gpt-test",
      provider_id: "test-provider",
      name: "GPT Test",
      default: ["text"],
      actions: {
        text: async () => ({
          id: "msg_1",
          role: "assistant",
          parts: [{ type: "text", text: "ok" }],
          metadata: {
            usage: {
              inputTokens: 100,
              outputTokens: 50,
            },
          },
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_1" },
    }))).json()

    const invokeResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "hi", model: "gpt-test" },
    }))
    assert.equal(invokeResponse.status, 200)

    const account = await balance.read("user_1")
    assert.equal(account.balance, 989_600)

    const chargesResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/billing/charges",
      method: "GET",
    }))
    assert.equal(chargesResponse.status, 200)
    const charges = await chargesResponse.json()
    assert.equal(charges.items.length, 1)
    assert.equal(charges.items[0].amount_microcredits, 10_400)
    assert.equal(charges.items[0].amount, 0.0104)
    assert.equal(charges.items[0].model_id, "gpt-test")

    const usageResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/usage/events",
      method: "GET",
    }))
    const usage = await usageResponse.json()
    assert.equal(usage.items[0].model_id, "gpt-test")
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("billingService supports per-million token pricing rules", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-billing-mtoken-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db })

    const balance = new BalanceService({
      init: 1,
    })
    base.use(balance)
    base.use(new BillingService({
      balance,
      pricing_rules: [{
        rule_id: "deepseek_v4_flash_test",
        service_id: "ai",
        action_id: "text",
        model_id: "deepseek-v4-flash",
        input_mtoken_microcredits: 140_000,
        cached_mtoken_microcredits: 2_800,
        output_mtoken_microcredits: 280_000,
      }],
    }))

    const ai = new AIService()
    ai.use({
      id: "deepseek-v4-flash",
      provider_id: "deepseek",
      name: "DeepSeek V4 Flash",
      default: ["text"],
      actions: {
        text: async () => ({
          id: "msg_1",
          role: "assistant",
          parts: [{ type: "text", text: "ok" }],
          metadata: {
            usage: {
              inputTokens: 1_000_000,
              cachedInputTokens: 300_000,
              outputTokens: 200_000,
            },
          },
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_1" },
    }))).json()

    const invokeResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "hi", model: "deepseek-v4-flash" },
    }))
    assert.equal(invokeResponse.status, 200)

    const chargesResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/billing/charges",
      method: "GET",
    }))
    assert.equal(chargesResponse.status, 200)
    const charges = await chargesResponse.json()
    assert.equal(charges.items.length, 1)
    assert.equal(charges.items[0].amount_microcredits, 154_840)
    assert.equal(charges.items[0].amount, 0.15484)

    const account = await balance.read("user_1")
    assert.equal(account.balance, 845_160)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("billingService supports explicit provider charges", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-billing-explicit-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new CityBase({ db })

    const balance = new BalanceService({
      init: 1,
    })
    base.use(balance)
    base.use(new BillingService({
      balance,
      pricing_rules: [{
        rule_id: "fallback_text",
        service_id: "ai",
        action_id: "text",
        request_microcredits: 10_000,
      }],
    }))

    const ai = new AIService({
      billing: base.getService("billing"),
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
            parts: [{ type: "text", text: "ok" }],
          },
          billing: {
            amount_microcredits: 123,
            note: "priced-provider charge",
            metadata: { provider_id: "priced-provider" },
          },
        }),
      },
    })
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_CITY_ADMIN_SECRET_KEY")

    const town = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/towns/tokens/apply",
      body: { town_id: town.town_id, user_id: "user_1" },
    }))).json()

    const invokeResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "hi", model: "priced-text" },
    }))
    assert.equal(invokeResponse.status, 200)

    const chargesResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/billing/charges",
      method: "GET",
    }))
    const charges = await chargesResponse.json()
    assert.equal(charges.items.length, 1)
    assert.equal(charges.items[0].amount_microcredits, 123)
    assert.equal(charges.items[0].note, "priced-provider charge")

    const account = await balance.read("user_1")
    assert.equal(account.balance, 999_877)
  } finally {
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
