import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Federation } from "@downcity/city"
import { createSqliteDb } from "./sqlite-db.mjs"
import { BalanceService } from "../../bin/index.js"

test("balanceService manages global balance, ledger, and topups", async () => {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-balance-service-"))

  try {
    process.chdir(tempDir)

    const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
    const base = new Federation({ db })

    const balance = new BalanceService({
      init_credits: 100_000_000,
    })
    base.use(balance)

    await base.health()
    const adminSecret = await readEnvValue(base, "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")

    const city = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/cities/create",
      body: { name: "Demo" },
    }))).json()
    const tokenBody = await (await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/cities/tokens/apply",
      body: { city_id: city.city_id, user_id: "user_1" },
    }))).json()

    assert.equal((await balance.read("user_1")).credits, 100_000_000)
    assert.equal((await balance.require("user_1", 30_000_000)).user_id, "user_1")

    const debit = await balance.sub("user_1", 20_000_000, { note: "chat" })
    assert.equal(debit.credits, 80_000_000)

    const meResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/me",
      method: "GET",
    }))
    assert.equal(meResponse.status, 200)
    const me = await meResponse.json()
    assert.equal(me.credits, 80_000_000)
    assert.equal(me.unit, "credits")
    assert.equal(me.usd, 80)
    assert.deepEqual(me.conversion, {
      credits_per_usd: 1_000_000,
      usd_decimals: 6,
    })
    assert.equal(me.display, "$80.00")

    const topupResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/topups/create",
      body: { credits: 50_000_000, note: "recharge" },
    }))
    assert.equal(topupResponse.status, 200)
    const topup = await topupResponse.json()
    assert.equal(topup.status, "pending")
    assert.equal(topup.credits, 50_000_000)
    assert.equal(topup.usd_cents, 5000)

    const finishResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/topups/finish",
      body: { topup_id: topup.topup_id },
    }))
    assert.equal(finishResponse.status, 200)
    assert.equal((await finishResponse.json()).status, "paid")

    const createRedeemCodeResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/redeem-codes/create",
      body: { credits: 40_000_000, note: "gift campaign" },
    }))
    assert.equal(createRedeemCodeResponse.status, 200)
    const redeemCode = await createRedeemCodeResponse.json()
    assert.equal(redeemCode.status, "active")
    assert.match(redeemCode.code, /^[A-Z0-9-]+$/)

    const redeemResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/redeem-codes/redeem",
      body: { code: redeemCode.code },
    }))
    assert.equal(redeemResponse.status, 200)
    const redeemed = await redeemResponse.json()
    assert.equal(redeemed.account.credits, 170_000_000)
    assert.equal(redeemed.redeem_code.status, "redeemed")
    assert.equal(redeemed.redeem_code.redeemed_by_user_id, "user_1")

    const redeemAgainResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/redeem-codes/redeem",
      body: { code: redeemCode.code },
    }))
    assert.equal(redeemAgainResponse.status, 409)

    const disableCreateResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/redeem-codes/create",
      body: { credits: 25_000_000, note: "manual stop" },
    }))
    assert.equal(disableCreateResponse.status, 200)
    const toDisable = await disableCreateResponse.json()

    const disableResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/redeem-codes/disable",
      body: { redeem_code_id: toDisable.redeem_code_id, note: "expired" },
    }))
    assert.equal(disableResponse.status, 200)
    assert.equal((await disableResponse.json()).status, "disabled")

    const historyResponse = await base.handleRequest(userRequest({
      token: tokenBody.user_token,
      path: "/v1/balance/history/me?limit=10",
      method: "GET",
    }))
    assert.equal(historyResponse.status, 200)
    const history = await historyResponse.json()
    assert.deepEqual(history.items.map((item) => item.kind), ["redeem", "topup", "sub", "init"])

    const usersResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/users?limit=10",
      method: "GET",
    }))
    assert.equal(usersResponse.status, 200)
    const users = await usersResponse.json()
    assert.equal(users.items[0].credits, 170_000_000)

    const redeemCodesResponse = await base.handleRequest(adminRequest(adminSecret, {
      path: "/v1/balance/redeem-codes?limit=10",
      method: "GET",
    }))
    assert.equal(redeemCodesResponse.status, 200)
    const redeemCodes = await redeemCodesResponse.json()
    assert.equal(redeemCodes.items.length, 2)
    assert.equal(redeemCodes.items[0].status, "disabled")
    assert.equal(redeemCodes.items[1].status, "redeemed")
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
