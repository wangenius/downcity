/**
 * Downcity Cloudflare Worker。
 * 业务 env 统一由 City 自己管理。
 * Worker 只负责提供基础运行时能力（如 D1）。
 */

import { drizzle } from "drizzle-orm/d1";
import {
  type City,
  type Context,
} from "@downcity/city";
import { compose_city } from "./compose-city.js";
import { createOpenAIProvider } from "./openai-provider.js";

const INITIAL_BALANCE = 100;
const CHAT_COST = 10;
const WORKER_VERSION = "0.0.1";

export interface Env {
  DB: D1Database;
}

let city_promise: Promise<City> | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400",
};

function get_city(env: Env, request: Request): Promise<City> {
  if (!city_promise) {
    city_promise = init_city(env);
  }
  return city_promise;
}

async function init_city(env: Env): Promise<City> {
  const db = drizzle(env.DB);
  const deepseek_provider = createOpenAIProvider({
    id: "deepseek",
    envKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
    defaultModelId: "deepseek-v4-flash",
  });
  const { city, balance, ai } = compose_city({
    db,
    dialect: "sqlite",
    raw: env.DB,
    models: [
      deepseek_provider.model({
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        description: "DeepSeek OpenAI-compatible text model",
        tags: ["deepseek", "text"],
      }),
      deepseek_provider.model({
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "DeepSeek OpenAI-compatible text model",
        tags: ["deepseek", "text"],
      }),
    ],
    record_usage_errors: true,
    balance: {
      init: INITIAL_BALANCE,
      unit: "credits",
    },
  });

  ai.hook.before(async (ctx) => {
    if (!shouldChargeAgentChat(ctx)) return;
    await balance.require(ctx.user!.user_id, CHAT_COST);
    ctx.locals.balance_amount = CHAT_COST;
  });
  ai.hook.after(async (ctx) => {
    if (!shouldChargeAgentChat(ctx)) return;
    if (!isSuccessfulOutput(ctx.output)) return;

    const amount = Number(ctx.locals.balance_amount ?? 0);
    if (!Number.isInteger(amount) || amount <= 0) return;

    await balance.sub(ctx.user!.user_id, amount, {
      note: "agent chat",
      meta: {
        bay_id: ctx.bay?.bay_id,
        action: ctx.action?.id,
        model_id: ctx.variant?.id,
      },
    });
  });

  await city.health();
  const accounts = city.getService("accounts")!;
  // 关键说明（中文）
  // accounts 的专用回调入口也统一挂到 `/v1/accounts/*`，
  // 这样 client / admin / worker 对外只有一套路由空间。
  city.router().all("/v1/accounts/auth/*", (c) => (accounts as any).getAuthHandler()(c.req.raw));
  city.router().get("/v1/accounts/oauth/callback", async (c) => (accounts as any).handleOAuthCallback(c.req.raw));

  return city;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return withCors(new Response(`Downcity is up and ready. worker=${WORKER_VERSION}`, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }));
    }

    const city = await get_city(env, request);
    if (request.method === "GET" && url.pathname === "/health") {
      const health = await city.health();
      return withCors(Response.json({
        ...health,
        version: WORKER_VERSION,
      }));
    }
    const response = await city.handleRequest(request);
    return withCors(response);
  },
};
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function shouldChargeAgentChat(ctx: Context): boolean {
  return Boolean(
    ctx.identity?.kind === "user" &&
    ctx.user?.user_id &&
    ctx.action?.id === "chat/completions",
  );
}

function isSuccessfulOutput(output: unknown): boolean {
  return !(output instanceof Response) || output.status < 400;
}
