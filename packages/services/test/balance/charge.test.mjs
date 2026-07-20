import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Federation, AIService } from "@downcity/city"
import { create_test_text_model } from "../fixtures/ai-channel.mjs"
import { createSqliteDb } from "./sqlite-db.mjs"
import { BalanceService } from "../../bin/index.js"

test("balanceService charges users with generic metadata", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-balance-charge-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })

    const balance = new BalanceService({ init_credits: 1_000_000 })
    base.use(balance)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/tokens/apply",
      body: { city_id: city.city_id, user_id: "user_1" },
    }))).json()

    const charge_input = {
      user_id: "user_1",
      credits: 123_456,
      idempotency_key: "test:req_1",
      note: "test charge",
      ref: "req_1",
      metadata: {
        service_id: "demo",
        action_id: "run",
      },
    }
    const [charge, duplicate_charge] = await Promise.all([
      balance.charge(charge_input),
      balance.charge(charge_input),
    ])

    assert.equal(duplicate_charge.charge_id, charge.charge_id)
    assert.equal(charge.credits, 123_456)
    assert.equal(charge.ref, "req_1")
    assert.deepEqual(JSON.parse(charge.metadata_json), {
      service_id: "demo",
      action_id: "run",
    })

    const account = await balance.read("user_1")
    assert.equal(account.credits, 876_544)
    await assert.rejects(
      balance.charge({
        ...charge_input,
        credits: 123_457,
      }),
      /idempotency_key was already used for a different charge/,
    )
    assert.equal((await balance.read("user_1")).credits, 876_544)

    const chargesResponse = await base.fetch(adminRequest(adminSecret, {
      path: "/v1/balance/charges?limit=10",
      method: "GET",
    }))
    assert.equal(chargesResponse.status, 200)
    const charges = await chargesResponse.json()
    assert.equal(charges.items.length, 1)
    assert.equal(charges.items[0].charge_id, charge.charge_id)

    const myChargesResponse = await base.fetch(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/charges/me?limit=10",
      method: "GET",
    }))
    assert.equal(myChargesResponse.status, 200)
    const myCharges = await myChargesResponse.json()
    assert.equal(myCharges.items[0].charge_id, charge.charge_id)

    const history = await balance.history("user_1", 10)
    assert.equal(history[0].kind, "charge")
    assert.equal(history[0].credits_delta, -123_456)
    assert.equal(history[0].ref, "req_1")
    assert.equal(JSON.parse(history[0].metadata_json).charge_id, charge.charge_id)

    const overdraftCharge = await balance.charge({
      user_id: "user_1",
      credits: 999_999_999,
      note: "overdraft charge",
    })
    assert.equal(overdraftCharge.credits, 999_999_999)
    assert.equal((await balance.read("user_1")).credits, -999_123_455)
    assert.equal((await balance.listCharges({ user_id: "user_1" })).length, 2)

    await assert.rejects(
      () => balance.precheck("user_1"),
      /insufficient balance/,
    )

    await balance.add("user_1", 999_123_455)
    assert.equal((await balance.precheck("user_1")).credits, 0)
    await assert.rejects(
      () => balance.precheck("user_1", 1),
      /insufficient balance/,
    )

    assert.equal((await balance.sub("user_1", 1)).credits, -1)
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService submits model charges through BalanceService", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-balance-charge-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })

    const balance = new BalanceService({ init_credits: 1_000_000 })
    base.use(balance)

    const ai = new AIService({ balance })
    ai.use(create_test_text_model({
      id: "priced-text",
      name: "Priced Text",
      bill: () => ({
        credits: 321,
        note: "model charge",
        metadata: { channel_id: "test-priced-text" },
      }),
    }))
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/tokens/apply",
      body: { city_id: city.city_id, user_id: "user_1" },
    }))).json()

    const response = await base.fetch(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "hi", model: "priced-text" },
    }))
    assert.equal(response.status, 200)

    const account = await balance.read("user_1")
    assert.equal(account.credits, 999_679)

    const charges = await balance.listCharges({ user_id: "user_1" })
    assert.equal(charges.length, 1)
    assert.equal(charges[0].credits, 321)
    assert.equal(charges[0].note, "model charge")
    assert.deepEqual(JSON.parse(charges[0].metadata_json), {
      channel_id: "test-priced-text",
    })
  } finally {
    process.chdir(cwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test("AIService allows one positive-balance overdraft and blocks the next AI request", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-ai-balance-precheck-"))

  try {
    process.chdir(tempDir)
    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })
    let providerCalls = 0

    const balance = new BalanceService({ init_credits: 100 })
    base.use(balance)

    const ai = new AIService({ balance })
    ai.use(create_test_text_model({
      id: "overdraft-text",
      name: "Overdraft Text",
      bill: () => ({
        credits: 321,
        note: "model charge",
      }),
      on_stream: () => {
        providerCalls += 1
      },
    }))
    base.use(ai)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.fetch(adminRequest(adminSecret, {
      path: "/v1/cities/tokens/apply",
      body: { city_id: city.city_id, user_id: "user_1" },
    }))).json()

    const firstResponse = await base.fetch(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "hi", model: "overdraft-text" },
    }))
    assert.equal(firstResponse.status, 200)
    assert.equal(providerCalls, 1)
    assert.equal((await balance.read("user_1")).credits, -221)

    const secondResponse = await base.fetch(userRequest({
      token: tokenBody.user_token,
      path: "/v1/ai/text",
      body: { prompt: "again", model: "overdraft-text" },
    }))
    assert.equal(secondResponse.status, 402)
    assert.equal(providerCalls, 1)
    assert.equal((await balance.listCharges({ user_id: "user_1" })).length, 1)
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
