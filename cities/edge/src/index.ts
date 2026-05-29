/**
 * Downcity Cloudflare Worker。
 * 业务 env 统一由 City 自己管理。
 * Worker 只负责提供基础运行时能力（如 D1）。
 */

import { drizzle } from "drizzle-orm/d1";
import {
  type Context,
} from "@downcity/city";
import { compose_block } from "../../shared/src/compose-block.js";
import { createOpenAIProvider } from "./openai-provider.js";

const INITIAL_BALANCE = 100;
const CHAT_COST = 10;
const WORKER_VERSION = "0.0.1";

export interface Env {
  DB: D1Database;
}

let basePromise: Promise<ReturnType<typeof compose_block>["base"]> | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400",
};

function getBase(env: Env, request: Request): Promise<ReturnType<typeof compose_block>["base"]> {
  if (!basePromise) {
    basePromise = initBase(env);
  }
  return basePromise;
}

async function initBase(env: Env): Promise<ReturnType<typeof compose_block>["base"]> {
  const db = drizzle(env.DB);
  const deepseekProvider = createOpenAIProvider({
    id: "deepseek",
    envKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
    defaultModelId: "deepseek-v4-flash",
  });
  const { base, balance, ai } = compose_block({
    db,
    dialect: "sqlite",
    raw: env.DB,
    models: [
      deepseekProvider.model({
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        description: "DeepSeek OpenAI-compatible text model",
        tags: ["deepseek", "text"],
      }),
      deepseekProvider.model({
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
        studio_id: ctx.studio?.studio_id,
        action: ctx.action?.id,
        model_id: ctx.variant?.id,
      },
    });
  });

  await base.health();
  const accounts = base.getService("accounts")!;
  // 关键说明（中文）
  // accounts 的专用回调入口也统一挂到 `/v1/accounts/*`，
  // 这样 client / admin / worker 对外只有一套路由空间。
  base.router().all("/v1/accounts/auth/*", (c) => (accounts as any).getAuthHandler()(c.req.raw));
  base.router().get("/v1/accounts/oauth/callback", async (c) => (accounts as any).handleOAuthCallback(c.req.raw));

  return base;
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

    const base = await getBase(env, request);
    if (request.method === "GET" && url.pathname === "/health") {
      const health = await base.health();
      return withCors(Response.json({
        ...health,
        version: WORKER_VERSION,
      }));
    }
    const response = await base.handleRequest(request);
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
