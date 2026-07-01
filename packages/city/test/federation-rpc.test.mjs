import assert from "node:assert/strict"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { City, Federation, Service } from "../bin/index.js"
import { FederationRPC } from "../../server/bin/index.js"
import { createSqliteDb } from "./sqlite-db.mjs"

test("City admin can access local FederationRPC without admin_secret_key", async () => {
  const fixture = await create_rpc_fixture("downcity-city-rpc-admin-")
  try {
    const city = new City({
      role: "admin",
      federation_url: fixture.url,
      city_id: "city_demo",
    })

    const services = await city.listServices()
    assert.ok(services.some((item) => item.id === "env"))

    const instruction = await city.instruction()
    assert.match(instruction, /Downcity Federation Instruction/)
  } finally {
    await fixture.close()
  }
})

test("City user can call local FederationRPC without user_token", async () => {
  const fixture = await create_rpc_fixture("downcity-city-rpc-user-")
  try {
    const city = new City({
      role: "user",
      federation_url: fixture.url,
      city_id: "city_demo",
    })

    const result = await city.service("echo").action("inspect").invoke({ value: 42 })
    assert.deepEqual(result, {
      identity: "user",
      city_id: "city_demo",
      user_id: "local-rpc-user",
      input: {
        city_id: "city_demo",
        value: 42,
      },
    })
  } finally {
    await fixture.close()
  }
})

test("FederationRPC rejects non-loopback hosts", async () => {
  const fixture = await create_federation_fixture("downcity-city-rpc-host-")
  try {
    const rpc = new FederationRPC(fixture.base)
    await assert.rejects(
      () => rpc.listen({ host: "0.0.0.0", port: 15315 }),
      /loopback/,
    )
  } finally {
    await fixture.close()
  }
})

async function create_rpc_fixture(prefix) {
  const fixture = await create_federation_fixture(prefix)
  const rpc = new FederationRPC(fixture.base)
  const port = await get_free_port()
  const binding = await rpc.listen({ port })
  return {
    url: binding.url,
    async close() {
      await rpc.close()
      await fixture.close()
    },
  }
}

async function create_federation_fixture(prefix) {
  const cwd = process.cwd()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  process.chdir(tempDir)
  const db = createSqliteDb(path.join(tempDir, "test.sqlite"))
  const base = new Federation({ db, dialect: "sqlite", raw: db.raw })

  const echo = new Service({
    id: "echo",
    name: "Echo",
  })
  echo.action("inspect", async (ctx) => ({
    identity: ctx.identity?.kind,
    city_id: ctx.city?.city_id,
    user_id: ctx.user?.user_id,
    input: ctx.input,
  }), { auth: ["user"] })
  base.use(echo)

  await base.health()
  return {
    base,
    async close() {
      process.chdir(cwd)
      await fs.rm(tempDir, { recursive: true, force: true })
    },
  }
}

async function get_free_port() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Failed to allocate test port"))
          return
        }
        resolve(address.port)
      })
    })
  })
}
