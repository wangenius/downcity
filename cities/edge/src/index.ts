/**
 * Downcity edge City 示例入口。
 *
 * 关键点（中文）
 * - 这是一个标准的 City edge 项目示例，部署入口统一走 `city deploy`。
 * - 业务 env、admin key、provider key 统一由 City 自己管理。
 * - Worker 只负责承接 Edge runtime 能力，例如 D1 与 HTTP request。
 */

import { drizzle } from "drizzle-orm/d1";
import {
  type CityBase,
} from "@downcity/city";
import { compose_city } from "./compose-city.js";
import {
  createGeminiImageProvider,
  createLuchiImageProvider,
  createOpenAIImageProvider,
} from "./image-provider.js";
import { createDeepSeekProvider } from "./deepseek-provider.js";

const INITIAL_BALANCE = 100;
const CHAT_REQUEST_COST_MICROCREDITS = 10_000;
const IMAGE_COST_MICROCREDITS = 50_000;
const WORKER_VERSION = "0.0.1";

export interface Env {
  DB: D1Database;
}

let city_promise: Promise<CityBase> | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400",
};

function get_city(env: Env, request: Request): Promise<CityBase> {
  if (!city_promise) {
    city_promise = init_city(env);
  }
  return city_promise;
}

async function init_city(env: Env): Promise<CityBase> {
  const db = drizzle(env.DB);
  const deepseek_provider = createDeepSeekProvider({
    id: "deepseek",
    envKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
    defaultModelId: "deepseek-v4-flash",
  });
  const luchi_image_provider = createLuchiImageProvider({
    id: "luchi-image",
    envKey: "LUCHI_IMAGE_API_KEY",
    defaultModelId: "gpt-image-2",
  });
  const image_302_provider = createOpenAIImageProvider({
    id: "302-image",
    envKey: "AI302_API_KEY",
    baseURL: "https://api.302.ai/v1",
    defaultModelId: "gpt-image-1",
    providerOptionsKey: "302ai",
  });
  const openai_image_provider = createOpenAIImageProvider({
    id: "openai-image",
    envKey: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
    defaultModelId: "gpt-image-1",
  });
  const gemini_image_provider = createGeminiImageProvider({
    id: "gemini-image",
    envKey: "GEMINI_API_KEY",
    defaultModelId: "gemini-2.5-flash-image",
  });
  const { city } = compose_city({
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
      luchi_image_provider.model({
        id: "luchi-gpt-image-2",
        name: "Luchi GPT Image 2",
        description: "Luchi async image generation model",
        tags: ["luchi", "image"],
        default: ["image"],
        meta: {
          upstream_model: "gpt-image-2",
        },
      }),
      luchi_image_provider.model({
        id: "luchi-gpt-image-1",
        name: "Luchi GPT Image 1",
        description: "Luchi async image generation model",
        tags: ["luchi", "image"],
        meta: {
          upstream_model: "gpt-image-1",
        },
      }),
      image_302_provider.model({
        id: "302-gpt-image-1",
        name: "302.ai GPT Image 1",
        description: "302.ai OpenAI-compatible image generation model",
        tags: ["302.ai", "image"],
        meta: {
          upstream_model: "gpt-image-1",
        },
      }),
      openai_image_provider.model({
        id: "openai-gpt-image-1",
        name: "OpenAI GPT Image 1",
        description: "OpenAI image generation model",
        tags: ["openai", "image"],
        meta: {
          upstream_model: "gpt-image-1",
        },
      }),
      gemini_image_provider.model({
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image",
        description: "Gemini generateContent image model",
        tags: ["gemini", "image"],
        meta: {
          upstream_model: "gemini-2.5-flash-image",
        },
      }),
    ],
    record_usage_errors: true,
    balance: {
      init: INITIAL_BALANCE,
      unit: "credits",
    },
    pricing_rules: [
      {
        rule_id: "ai_chat_completions_default",
        service_id: "ai",
        action_id: "chat/completions",
        request_microcredits: CHAT_REQUEST_COST_MICROCREDITS,
        note: "Default AI chat request price",
      },
      {
        rule_id: "ai_image_default",
        service_id: "ai",
        action_id: "image",
        image_microcredits: IMAGE_COST_MICROCREDITS,
        note: "Default AI image price",
      },
      {
        rule_id: "ai_image_create_default",
        service_id: "ai",
        action_id: "image/create",
        request_microcredits: IMAGE_COST_MICROCREDITS,
        note: "Default async AI image create price",
      },
    ],
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    const response = await city.handleRequest(request, { execution: ctx });
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
