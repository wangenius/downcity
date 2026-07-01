import assert from "node:assert/strict"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { City, Federation, Service } from "../bin/index.js"
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

async function create_rpc_fixture(prefix) {
  const fixture = await create_federation_fixture(prefix)
  const port = await get_free_port()
  const rpc = await start_test_federation_rpc_server(fixture.base, port)
  return {
    url: rpc.url,
    async close() {
      await rpc.stop()
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

async function start_test_federation_rpc_server(base, port) {
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    let buffered = ""

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8")
      let newline_index = buffered.indexOf("\n")
      while (newline_index >= 0) {
        const line = buffered.slice(0, newline_index).trim()
        buffered = buffered.slice(newline_index + 1)
        if (line) {
          void handle_test_federation_rpc_line(base, line, (frame) => {
            socket.write(`${JSON.stringify(frame)}\n`)
          })
        }
        newline_index = buffered.indexOf("\n")
      }
    })

    socket.on("close", () => {
      sockets.delete(socket)
    })
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  return {
    url: `rpc://127.0.0.1:${port}`,
    async stop() {
      for (const socket of sockets) {
        socket.destroy()
      }
      sockets.clear()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

async function handle_test_federation_rpc_line(base, line, write_frame) {
  let request_id = "parse"
  try {
    const request = JSON.parse(line)
    request_id = typeof request.id === "string" ? request.id : request_id
    if (request.method !== "federation.request") {
      throw new Error(`Unsupported Federation RPC method: ${String(request.method)}`)
    }

    const response = await execute_test_federation_rpc_request(base, request)
    write_frame({
      id: request_id,
      success: true,
      data: response,
    })
  } catch (error) {
    write_frame({
      id: request_id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function execute_test_federation_rpc_request(base, rpc_request) {
  const request = new Request(`http://downcity.local${rpc_request.params.path}`, {
    method: rpc_request.params.method,
    headers: rpc_request.params.headers ?? {},
    body: rpc_request.params.method === "GET" ? undefined : rpc_request.params.body,
  })
  const response = await base.fetch(request, {
    trusted_identity: normalize_test_rpc_identity(rpc_request.params.identity),
  })
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
}

function normalize_test_rpc_identity(identity) {
  if (identity.role === "admin") {
    return { level: "admin" }
  }
  const city_id = String(identity.city_id || "").trim()
  if (!city_id) {
    throw new TypeError("city_id is required for Federation RPC user identity")
  }
  return {
    level: "user",
    user: {
      user_id: String(identity.user_id || "local-rpc-user").trim() || "local-rpc-user",
      metadata: identity.metadata ?? {},
    },
    city: {
      city_id,
      status: "active",
    },
  }
}
