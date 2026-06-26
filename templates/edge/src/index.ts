/**
 * Downcity edge Federation 示例入口。
 *
 * 关键点（中文）
 * - 这是一个标准的 Federation edge 项目示例，部署入口统一走 `city deploy`。
 * - 业务 env、admin key、provider key 统一由 Federation 自己管理。
 * - Worker 只负责承接 Edge runtime 能力，例如 D1 与 HTTP request。
 * - 装配过程平铺在本文件，不再通过 compose_city 函数包裹。
 */

import { drizzle } from "drizzle-orm/d1";
import { Federation, AIService } from "@downcity/city";
import type { Context } from "@downcity/city";
import {
  AccountsService,
  BalanceService,
  PaymentService,
  UsageService,
  creemPaymentProvider,
  dodoPaymentProvider,
  githubAccountsProvider,
  googleAccountsProvider,
  stripePaymentProvider,
  wechatAccountsProvider,
  waffoPaymentProvider,
} from "@downcity/services";
import {
  GeminiImageProvider,
  LuchiImageProvider,
  OpenAIImageProvider,
} from "./image-provider.js";
import { DeepSeekProvider } from "./deepseek-provider.js";

const INITIAL_BALANCE = 100;
const CHAT_REQUEST_COST_MICROCREDITS = 10_000;
const IMAGE_COST_MICROCREDITS = 50_000;
const WORKER_VERSION = "0.0.1";

export interface Env {
  DB: D1Database;
}

let federation_promise: Promise<Federation> | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400",
};

function get_federation(env: Env): Promise<Federation> {
  if (!federation_promise) {
    federation_promise = init_federation(env);
  }
  return federation_promise;
}

async function init_federation(env: Env): Promise<Federation> {
  const db = drizzle(env.DB);

  // 关键说明（中文）
  // 顺序有依赖关系：payment 依赖 balance 暴露的 readTopup / finishTopup；ai 依赖 balance 执行扣费。
  const federation = new Federation({ db });

  federation.use(new AccountsService({
    providers: [
      githubAccountsProvider(),
      googleAccountsProvider(),
      wechatAccountsProvider(),
    ],
  }));

  const balance = new BalanceService({ init: INITIAL_BALANCE });
  federation.use(balance);

  federation.use(new PaymentService({
    readTopup: async (topup_id) => await balance.readTopup(topup_id),
    finishTopup: async (topup_id, extra) => await balance.finishTopup(topup_id, extra),
    providers: [
      stripePaymentProvider(),
      creemPaymentProvider(),
      dodoPaymentProvider(),
      waffoPaymentProvider(),
    ],
  }));

  federation.use(new UsageService({ record_errors: true }));

  const deepseek_provider = new DeepSeekProvider();
  const luchi_image_provider = new LuchiImageProvider({
    id: "luchi-image",
    envKey: "LUCHI_IMAGE_API_KEY",
    defaultModelId: "gpt-image-2",
  });
  const image_302_provider = new OpenAIImageProvider({
    id: "302-image",
    envKey: "AI302_API_KEY",
    baseURL: "https://api.302.ai/v1",
    defaultModelId: "gpt-image-1",
    providerOptionsKey: "302ai",
  });
  const openai_image_provider = new OpenAIImageProvider({
    id: "openai-image",
    envKey: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
    defaultModelId: "gpt-image-1",
  });
  const gemini_image_provider = new GeminiImageProvider({
    id: "gemini-image",
    envKey: "GEMINI_API_KEY",
    defaultModelId: "gemini-2.5-flash-image",
  });

  const ai = new AIService({ balance });
  ai.use([
    deepseek_provider.model({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      description: "DeepSeek OpenAI-compatible text model",
      tags: ["deepseek", "text"],
      bill: (ctx, output) => bill_ai_request(ctx, output, CHAT_REQUEST_COST_MICROCREDITS),
    }),
    deepseek_provider.model({
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      description: "DeepSeek OpenAI-compatible text model",
      tags: ["deepseek", "text"],
      bill: (ctx, output) => bill_ai_request(ctx, output, CHAT_REQUEST_COST_MICROCREDITS),
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
      bill: (ctx, output) => bill_ai_request(ctx, output, IMAGE_COST_MICROCREDITS),
    }),
    luchi_image_provider.model({
      id: "luchi-gpt-image-1",
      name: "Luchi GPT Image 1",
      description: "Luchi async image generation model",
      tags: ["luchi", "image"],
      meta: {
        upstream_model: "gpt-image-1",
      },
      bill: (ctx, output) => bill_ai_request(ctx, output, IMAGE_COST_MICROCREDITS),
    }),
    image_302_provider.model({
      id: "302-gpt-image-1",
      name: "302.ai GPT Image 1",
      description: "302.ai OpenAI-compatible image generation model",
      tags: ["302.ai", "image"],
      meta: { upstream_model: "gpt-image-1" },
      bill: (ctx, output) => bill_ai_request(ctx, output, IMAGE_COST_MICROCREDITS),
    }),
    openai_image_provider.model({
      id: "openai-gpt-image-1",
      name: "OpenAI GPT Image 1",
      description: "OpenAI image generation model",
      tags: ["openai", "image"],
      meta: { upstream_model: "gpt-image-1" },
      bill: (ctx, output) => bill_ai_request(ctx, output, IMAGE_COST_MICROCREDITS),
    }),
    gemini_image_provider.model({
      id: "gemini-2.5-flash-image",
      name: "Gemini 2.5 Flash Image",
      description: "Gemini generateContent image model",
      tags: ["gemini", "image"],
      meta: { upstream_model: "gemini-2.5-flash-image" },
      bill: (ctx, output) => bill_ai_request(ctx, output, IMAGE_COST_MICROCREDITS),
    }),
  ]);
  federation.use(ai);

  await federation.health();

  return federation;
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

    const federation = await get_federation(env);
    if (request.method === "GET" && url.pathname === "/health") {
      const health = await federation.health();
      return withCors(Response.json({
        ...health,
        version: WORKER_VERSION,
      }));
    }
    const response = await federation.handleRequest(request, { execution: ctx });
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

/**
 * 生成一次 AI 调用的账单行。
 */
function bill_ai_request(ctx: Context, output: unknown, amount_microcredits: number) {
  const mode = String(ctx.metering?.metadata?.mode ?? "request");
  return {
    user_id: read_bill_user_id(output),
    amount_microcredits,
    note: `AI ${mode}`,
    ref: read_bill_ref(output),
    metadata: {
      service_id: "ai",
      action_id: mode,
      model_id: ctx.metering?.model_id ?? ctx.variant?.id,
      provider_id: ctx.metering?.provider_id,
    },
  };
}

/**
 * 从输出对象中提取账单引用。
 */
function read_bill_ref(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  const ref = record.job_id ?? record.id ?? record.ref;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

/**
 * 从输出对象中提取扣费用户 ID。
 */
function read_bill_user_id(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const user_id = (metadata as Record<string, unknown>).user_id;
  return typeof user_id === "string" && user_id.trim() ? user_id.trim() : undefined;
}
