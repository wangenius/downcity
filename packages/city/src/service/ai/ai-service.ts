/**
 * AI Service 模块。
 *
 * AIService 处理所有 AI 通路（SDK 通路 + OpenAI 兼容通路）。
 * 通过 action() 注册 modality action，通过 resolve() 匹配模型和 action。
 *
 * 鉴权由 City 在路由入口统一强制执行。
 *
 * 路由（City 自动生成）：
 * - POST /v1/ai/text             — 文本生成
 * - POST /v1/ai/stream           — 流式生成
 * - POST /v1/ai/video            — 视频生成
 * - POST /v1/ai/image/create     — 创建图片生成任务
 * - POST /v1/ai/image/result     — 查询图片生成任务
 * - POST /v1/ai/chat/completions — OpenAI 兼容端点
 * - GET  /v1/ai/models           — 模型列表
 */

import { Service, type Context } from "../service.js";
import { httpError } from "../../utils/helpers.js";
import type { ActionFn } from "../action.js";
import { sqliteAsyncJobs } from "../async-job/schema.js";
import { normalizeAIUsage } from "./helpers.js";
import type { AsyncJobRecord, AsyncJobStatus } from "../../types/AsyncJob.js";
import type {
  AIServiceOptions,
  ModelConfig,
  ModelActions,
  PublicModel,
} from "./types.js";
import type {
  AIBalanceBridge,
  AIProviderChargedOutput,
  AIProviderChargedResponse,
  AIProviderChargeLine,
} from "./charge.js";
import type {
  AIImageJobContext,
  AIImageProviderCreateResult,
  AIImageProviderFetchResult,
  AIImageProviderResult,
  UserImageJobCreateResult,
  UserImageJobResult,
} from "./job-types.js";
import {
  attach_resolved_reasoning,
  resolve_model_reasoning,
} from "./reasoning.js";
import { AIModelRegistry } from "./model-registry.js";
import { resolve_text_routing_plan } from "./model-routing.js";
import type {
  AIRoutingFallbackReason,
  AIResolvedAction,
  AIResolvedRoutingPlan,
} from "../../types/AIRouting.js";
import {
  claim_image_job,
  finish_image_job_fetch,
  release_image_job_claim,
} from "./image-job-store.js";

/** AIService 直接暴露的 SDK 通路模态列表。图片只通过 image/create + image/result 暴露。 */
const MODALITIES = ["text", "stream", "video", "tts", "asr"] as const;
/** 用户侧默认以 text 模态排序模型 */
const DEFAULT_MODEL_MODE = "text";
/** 图片任务的内部 action 列表。 */
const IMAGE_ACTION_MODES = ["image_create", "image_fetch"] as const;
/** 图片生成任务在通用 async_jobs 表中的类型。 */
const IMAGE_GENERATE_JOB_TYPE = "ai.image.generate";
/** 图片任务后台抓取 action。 */
const IMAGE_FETCH_ACTION = "image/fetch";
/** 图片任务默认最长 pending 时间：2 小时。 */
const DEFAULT_IMAGE_MAX_PENDING_DURATION_MS = 2 * 60 * 60 * 1000;
/** 图片任务 pending 超时错误。 */
const IMAGE_PENDING_TIMEOUT_ERROR = "upstream timeout";

type Modality = (typeof MODALITIES)[number];
type EnvReader = (key: string) => string | undefined;
type UsageRecord = Record<string, unknown>;
type ResolvedProviderOutput = {
  output: unknown;
  charge?: AIProviderChargeLine | Promise<AIProviderChargeLine | undefined>;
};
type StoredImagePart = Record<string, unknown> & {
  type: "file";
  url: string;
};

/**
 * 判断一个值是否为 HTTP Response。
 */
function isResponse(value: unknown): value is Response {
  return typeof value === "object" && value !== null && "status" in value && "headers" in value;
}

/**
 * 判断一个值是否为普通对象。
 */
function isRecord(value: unknown): value is UsageRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * 判断 Provider 是否返回了带账单 Response。
 */
function isProviderChargedResponse(value: unknown): value is AIProviderChargedResponse {
  return isRecord(value) && value.response instanceof Response;
}

/**
 * 判断 Provider 是否返回了带账单普通输出。
 */
function isProviderChargedOutput(value: unknown): value is AIProviderChargedOutput {
  return isRecord(value) && "output" in value;
}

/**
 * 判断一个值是否为 Promise-like。
 */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === "object" && "then" in value && typeof (value as { then?: unknown }).then === "function");
}

/**
 * 读取可选字符串。
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 读取可空字符串字段。
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * 读取可空数字字符串字段。
 */
function readNullableNumberString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * 读取可选数字。
 */
function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 读取正数配置。
 */
function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * 读取任务状态。
 */
function readJobStatus(value: unknown): AsyncJobStatus {
  return value === "queued" || value === "running" || value === "fetching" || value === "succeeded" || value === "failed"
    ? value
    : "failed";
}

/**
 * 安全解析 JSON 对象。
 */
function parseRecordJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 安全解析 UIMessage。
 */
function parseImageMessage(value: unknown): AIImageProviderResult["result"] | undefined {
  const record = parseRecordJson(value);
  return record.role === "assistant" && Array.isArray(record.parts)
    ? record as unknown as AIImageProviderResult["result"]
    : undefined;
}

/**
 * 把 TableApi 普通行转成图片任务记录。
 */
function rowToAsyncJobRecord(row: Record<string, unknown>): AsyncJobRecord {
  return {
    job_id: String(row.job_id ?? ""),
    job_type: String(row.job_type ?? ""),
    status: readJobStatus(row.status),
    input_json: String(row.input_json ?? "{}"),
    state_json: readNullableString(row.state_json),
    result_json: readNullableString(row.result_json),
    error: readNullableString(row.error),
    message: readNullableString(row.message),
    poll_after_ms: readNullableNumberString(row.poll_after_ms),
    city_id: readNullableString(row.city_id),
    user_id: readNullableString(row.user_id),
    service_id: readNullableString(row.service_id),
    model_id: readNullableString(row.model_id),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * 保留已知 HTTP 错误状态，其它异常统一包装成上游错误。
 */
function imageActionError(error: unknown, fallback_message: string): Error {
  if (error instanceof Error && typeof (error as { statusCode?: unknown }).statusCode === "number") {
    return error;
  }
  return httpError(502, error instanceof Error ? error.message : fallback_message);
}

/**
 * 从输出对象中读取 provider usage。
 */
function extractUsage(output: unknown): unknown {
  if (!isRecord(output)) return undefined;
  const metadata = isRecord(output.metadata) ? output.metadata : undefined;
  if (metadata && "usage" in metadata) return metadata.usage;
  if (metadata && "usageMetadata" in metadata) return metadata.usageMetadata;
  if ("usage" in output) return output.usage;
  return undefined;
}

/**
 * 兼容常见 provider usage 字段。
 */
function normalizeUsage(usage: unknown): {
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
} {
  return normalizeAIUsage(usage);
}

/**
 * 统计 UIMessage file parts 里的图片数量。
 */
function countImageOutputs(output: unknown): number | undefined {
  if (!isRecord(output) || !Array.isArray(output.parts)) return undefined;
  const count = output.parts.filter((part) => {
    if (!isRecord(part)) return false;
    const type = String(part.type ?? "");
    const media_type = String(part.mediaType ?? part.media_type ?? "");
    return type === "file" && media_type.startsWith("image/");
  }).length;
  return count > 0 ? count : undefined;
}

/**
 * 判断 file part URL 是否是可转存的远程 URL。
 */
function isStorableRemoteFilePart(part: unknown): part is StoredImagePart {
  if (!isRecord(part)) return false;
  if (part.type !== "file") return false;
  const url = readOptionalString(part.url);
  return Boolean(url && /^https?:\/\//iu.test(url));
}

/**
 * 读取 file part 的媒体类型。
 */
function readFilePartMediaType(part: Record<string, unknown>): string {
  return readOptionalString(part.mediaType)
    ?? readOptionalString(part.media_type)
    ?? "application/octet-stream";
}

/**
 * 读取 file part 的建议文件名。
 */
function readFilePartFilename(part: Record<string, unknown>): string | undefined {
  return readOptionalString(part.filename);
}

/**
 * 判断 provider 是否返回了图片任务创建结果。
 */
function isImageProviderCreateResult(value: unknown): value is AIImageProviderCreateResult {
  if (!value || typeof value !== "object") return false;
  const record = value as { job_id?: unknown; status?: unknown };
  return typeof record.job_id === "string" &&
    Boolean(record.job_id.trim()) &&
    isImageJobStatus(record.status);
}

/**
 * 判断 provider 是否返回了图片任务查询结果。
 */
function isImageProviderResult(value: unknown): value is AIImageProviderResult {
  if (!value || typeof value !== "object") return false;
  const record = value as { job_id?: unknown; status?: unknown; result?: unknown };
  if (typeof record.job_id !== "string" || !record.job_id.trim()) return false;
  if (!isImageJobStatus(record.status)) return false;
  if (record.status === "succeeded") {
    const result = isRecord(record.result) ? record.result : undefined;
    if (!result || result.role !== "assistant" || !Array.isArray(result.parts)) return false;
  }
  return true;
}

/**
 * 判断图片任务状态。
 */
function isImageJobStatus(value: unknown): boolean {
  return value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed";
}

export class AIService extends Service {
  /** 模型注册表 */
  private readonly models = new AIModelRegistry();

  /** SDK 通路 action 映射（modality → action） */
  private modalityActions = new Map<string, ActionFn>();

  /** AI 专用余额桥接。 */
  private readonly balance?: AIBalanceBridge;
  /** 图片异步任务允许保持 queued/running 的最长时间。 */
  private readonly image_max_pending_duration_ms: number;

  constructor(options: AIServiceOptions = {}) {
    super({ id: "ai", name: "AI", tables: { async_jobs: sqliteAsyncJobs } });
    this.balance = options.balance;
    this.image_max_pending_duration_ms = normalizePositiveNumber(
      options.image_max_pending_duration_ms,
      DEFAULT_IMAGE_MAX_PENDING_DURATION_MS,
    );

    // 为每个 modality 注册 routing action
    for (const modality of MODALITIES) {
      this.action(modality, async (ctx) => this.handleModality(modality, ctx), {
        auth: ["user", "admin"],
      }).before((ctx) => this.precheck(ctx));
    }

    // 图片生成的任务式端点。SDK 通过 image_create / image_result 显式访问。
    this.action("image/create", async (ctx) => this.createImageJob(ctx), {
      auth: ["user", "admin"],
    }).before((ctx) => this.precheck(ctx));
    this.action("image/result", async (ctx) => this.readImageJob(ctx), {
      auth: ["user", "admin"],
    });
    this.action(IMAGE_FETCH_ACTION, async (ctx) => this.fetchImageJob(ctx), {
      auth: ["admin"],
    });

    // OpenAI 兼容端点
    this.action("chat/completions", async (ctx) => this.handleChatCompletions(ctx), {
      auth: ["user", "admin"],
    }).before((ctx) => this.precheck(ctx));

    // 模型列表走同一路径，根据身份决定可见范围。
    this.action("models", (ctx) => ({
      items: AIService.listModels(this, {
        env: ctx.env,
        identity: ctx.identity?.kind ?? "guest",
      }),
    }), { method: "GET", auth: ["user", "admin"] });
  }

  // ========== 模型注册 ==========

  use(...inputs: (ModelConfig | ModelConfig[])[]): this {
    this.models.register(...inputs);
    return this;
  }

  listModels(): ModelConfig[] {
    return this.models.list();
  }

  hasAction(): boolean {
    return this.models.size > 0;
  }

  // ========== 模型匹配 ==========

  resolve(query: { model?: string; mode?: string }, env?: EnvReader): { model?: ModelConfig; action: ActionFn } {
    const { model: modelId, mode } = query;
    const isOpenAIMode = mode === "openai";

    if (!modelId) throw httpError(422, "model is required");

    const model = this.models.get(modelId);
    if (!model) throw httpError(422, `Unknown model: ${modelId}`);
    if (env && this.models.get_missing_env(model, env).length > 0) {
      throw httpError(422, `No available model: ${modelId}`);
    }
    const action = isOpenAIMode ? this.resolveOpenAIAction(model) : this.getAction(model, mode);
    if (!action) throw httpError(422, `Model ${modelId} does not support mode: ${mode ?? "text"}`);
    return { model, action };
  }

  private normalizeModelId(input: unknown): string | undefined {
    const model_id = typeof input === "string" ? input.trim() : "";
    return model_id || undefined;
  }

  private getAction(model: ModelConfig, mode?: string): ActionFn | undefined {
    if (mode === "image" || IMAGE_ACTION_MODES.includes(mode as (typeof IMAGE_ACTION_MODES)[number])) {
      const has_image_actions = Boolean(model.actions.image_create && model.actions.image_fetch);
      if (!has_image_actions) return undefined;
      return mode === "image"
        ? model.actions.image_create
        : model.actions[mode as keyof ModelActions];
    }
    return model.actions[(mode ?? "text") as keyof ModelActions];
  }

  private resolveOpenAIAction(model: ModelConfig): ActionFn | undefined {
    if (model.actions.openai) return model.actions.openai;
    if (model.baseURL && model.envKey) return this.createAutoPassthroughAction(model);
    return undefined;
  }

  private createAutoPassthroughAction(model: ModelConfig): ActionFn {
    const baseURL = model.baseURL!;
    const envKey = model.envKey!;
    const passthroughModel = model.passthroughModel;

    return async (ctx: Context): Promise<Response> => {
      const apiKey = ctx.env(envKey);
      if (!apiKey) {
        return new Response(JSON.stringify({
          error: { message: `${envKey} is required`, type: "authentication_error" },
        }), { status: 401, headers: { "content-type": "application/json" } });
      }

      const body = { ...ctx.input } as Record<string, unknown>;
      if (passthroughModel) {
        body.model = passthroughModel;
      }

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  private getModelModalities(model: ModelConfig): string[] {
    const modalities = Object.keys(model.actions).filter((key) => model.actions[key] !== undefined);
    if (modalities.includes("image_create") && modalities.includes("image_fetch")) {
      modalities.push("image");
    }
    if (!modalities.includes("openai") && this.resolveOpenAIAction(model)) modalities.push("openai");
    return modalities.filter((mode) => mode !== "image_create" && mode !== "image_fetch" && mode !== "image_result");
  }

  /** 按媒体输入解析最终模型，推理强度必须在该步骤之后解析。 */
  private plan_text_execution(
    resolved: AIResolvedAction,
    ctx: Context,
    mode: string,
  ): AIResolvedRoutingPlan {
    return resolve_text_routing_plan(resolved, ctx.input, mode, {
      resolve_model: (input) => typeof input === "string"
        ? this.models.get(input)
        : this.models.get(input.id) ?? input,
      resolve_action: (model, target_mode) => target_mode === "openai"
        ? this.resolveOpenAIAction(model)
        : this.getAction(model, target_mode),
      is_available: (model) => this.models.get_missing_env(model, ctx.env).length === 0,
    });
  }

  // ========== SDK 通路 ==========

  private async handleModality(modality: Modality, ctx: Context): Promise<unknown | Response> {
    const initial_resolved = this.resolve({ model: this.normalizeModelId(ctx.input.model), mode: modality }, ctx.env);
    const { resolved, fallback_from, fallback_reason, fallback_media_type } = this.plan_text_execution(initial_resolved, ctx, modality);
    const reasoning = resolved.model && (modality === "text" || modality === "stream")
      ? resolve_model_reasoning(resolved.model, ctx.input)
      : undefined;
    this.attachResolvedModel(ctx, resolved.model, modality, { fallback_from, fallback_reason, fallback_media_type });
    attach_resolved_reasoning(ctx, reasoning);
    const started_at = Date.now();

    try {
      const provider_output = await resolved.action(ctx);
      const { output, charge } = this.resolveProviderOutput(provider_output);
      this.attachOutputMetering(ctx, output, modality, started_at);
      const resolved_charge = charge ?? resolved.model?.bill?.(ctx, output);
      const defer_charge = isResponse(output) || isPromiseLike(resolved_charge);
      await this.handleCharge(ctx, resolved_charge, defer_charge);
      if (isResponse(output)) return output;
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });
    }
  }

  // ========== 图片任务通路 ==========

  private async createImageJob(ctx: Context): Promise<UserImageJobCreateResult> {
    const resolved = this.resolve({ model: this.normalizeModelId(ctx.input.model), mode: "image_create" }, ctx.env);
    this.attachResolvedModel(ctx, resolved.model, "image/create");
    try {
      const created = await resolved.action(ctx);
      if (!isImageProviderCreateResult(created)) {
        throw httpError(500, "image_create action returned invalid result");
      }
      await this.insertImageJob(ctx, created);
      await this.enqueueImageFetch(ctx, created.job_id, created.poll_after_ms);
      return created;
    } catch (error) {
      throw imageActionError(error, "image_create action failed");
    }
  }

  private async readImageJob(ctx: Context): Promise<UserImageJobResult> {
    const job = await this.requireImageJob(ctx);
    try {
      return this.imageJobToResult(job);
    } catch (error) {
      throw imageActionError(error, "image_result action failed");
    }
  }

  /**
   * 后台抓取图片任务状态，并根据结果更新 async_jobs。
   */
  private async fetchImageJob(ctx: Context): Promise<AIImageProviderFetchResult> {
    let claim: Awaited<ReturnType<typeof claim_image_job>> = null;
    const initial_job = await this.requireImageJob(ctx);
    try {
      if (this.isTerminalImageJob(initial_job)) return this.imageJobToResult(initial_job);
      const table = ctx.db.async_jobs;
      if (!table) throw httpError(500, "AI async_jobs table is not initialized");
      claim = await claim_image_job(table, initial_job);
      if (!claim) return this.imageJobToResult(await this.requireImageJob(ctx));
      const job = claim.record;
      if (this.isImageJobPendingTimedOut(job)) {
        const output = this.createImageJobPendingTimeoutResult(job);
        await finish_image_job_fetch(table, claim, output);
        return output;
      }

      const model_id = job.model_id ?? readOptionalString(ctx.input.model);
      if (!model_id) throw httpError(422, "Image job is missing model_id");
      const model = this.models.get(model_id);
      if (!model?.actions.image_fetch) {
        throw httpError(422, `No image_fetch action for model: ${model_id}`);
      }

      this.attachResolvedModel(ctx, model, IMAGE_FETCH_ACTION);
      this.attachImageJobContext(ctx, job);
      const started_at = Date.now();
      const output = await model.actions.image_fetch(ctx);
      if (!isImageProviderResult(output)) {
        throw httpError(500, "image_fetch action returned invalid result");
      }
      const stored_output = await this.normalizeImageResultStorage(ctx, output);
      const should_charge = output.status === "succeeded" && Boolean(output.result) && !job.result_json;
      if (should_charge) {
        this.attachOutputMetering(ctx, stored_output.result, "image", started_at);
        const charge = model.bill?.(ctx, stored_output);
        await this.handleCharge(ctx, charge, false, `ai_image:${job.job_id}`);
      }
      await finish_image_job_fetch(table, claim, stored_output);
      if (stored_output.status === "queued" || stored_output.status === "running") {
        await this.enqueueImageFetch(ctx, job.job_id, stored_output.poll_after_ms);
      }
      return stored_output;
    } catch (error) {
      const table = ctx.db.async_jobs;
      if (table && claim) await release_image_job_claim(table, claim);
      throw imageActionError(error, "image_fetch action failed");
    }
  }

  /**
   * 判断图片任务是否已经进入本地终态。
   */
  private isTerminalImageJob(job: AsyncJobRecord): boolean {
    return Boolean((job.status === "succeeded" && job.result_json) || job.status === "failed");
  }

  /**
   * 判断图片任务是否超过平台允许的 pending 时间。
   */
  private isImageJobPendingTimedOut(job: AsyncJobRecord): boolean {
    if (job.status !== "queued" && job.status !== "running" && job.status !== "fetching") return false;
    const created_at = Date.parse(job.created_at);
    if (!Number.isFinite(created_at)) return false;
    return Date.now() - created_at >= this.image_max_pending_duration_ms;
  }

  /**
   * 构造 pending 超时后的统一失败结果。
   */
  private createImageJobPendingTimeoutResult(job: AsyncJobRecord): AIImageProviderFetchResult {
    return {
      job_id: job.job_id,
      status: "failed",
      message: IMAGE_PENDING_TIMEOUT_ERROR,
      error: IMAGE_PENDING_TIMEOUT_ERROR,
      metadata: {
        ...parseRecordJson(job.state_json),
        timeout_reason: IMAGE_PENDING_TIMEOUT_ERROR,
        max_pending_duration_ms: this.image_max_pending_duration_ms,
      },
    };
  }

  /**
   * 调度下一次图片任务抓取。
   */
  private async enqueueImageFetch(ctx: Context, job_id: string, delay_ms?: number): Promise<void> {
    if (!ctx.queue) return;
    await ctx.queue.send({
      service: "ai",
      action: IMAGE_FETCH_ACTION,
      input: { job_id },
      delay_ms,
    });
  }

  /**
   * 将图片结果里的外部 file URL 归一到 Federation 默认存储。
   *
   * 关键说明（中文）
   * - 只处理 succeeded 结果，queued/running/failed 保持原样。
   * - 已经属于当前 storage 的 URL 直接跳过，避免重复转存。
   * - 转存失败时保留源地址，不影响图片任务成功写入。
   */
  private async normalizeImageResultStorage(
    ctx: Context,
    output: AIImageProviderFetchResult,
  ): Promise<AIImageProviderFetchResult> {
    if (!ctx.storage || output.status !== "succeeded" || !output.result) return output;
    const result = output.result as { parts?: unknown[] };
    if (!Array.isArray(result.parts)) return output;

    let changed = false;
    const next_parts: unknown[] = [];
    for (const part of result.parts) {
      if (!isStorableRemoteFilePart(part)) {
        next_parts.push(part);
        continue;
      }

      const source_url = part.url;
      if (ctx.storage.owns(source_url)) {
        next_parts.push(part);
        continue;
      }

      try {
        const stored = await ctx.storage.store({
          source_url,
          media_type: readFilePartMediaType(part),
          filename: readFilePartFilename(part),
        });
        const stored_url = readOptionalString(stored.url);
        if (!stored_url) {
          next_parts.push(part);
          continue;
        }
        next_parts.push({
          ...part,
          url: stored_url,
        });
        changed = true;
      } catch (error) {
        console.warn(
          `[AIService] storage store failed, keeping source url :: ${error instanceof Error ? error.message : String(error)} :: url=${source_url}`,
        );
        next_parts.push(part);
      }
    }

    if (!changed) return output;
    return {
      ...output,
      result: {
        ...output.result,
        parts: next_parts as typeof output.result.parts,
      },
    };
  }

  /**
   * 写入图片任务。
   */
  private async insertImageJob(ctx: Context, created: AIImageProviderCreateResult): Promise<void> {
    const table = ctx.db.async_jobs;
    if (!table) throw httpError(500, "AI async_jobs table is not initialized");
    const now = new Date().toISOString();
    await table.insert({
      job_id: created.job_id,
      job_type: IMAGE_GENERATE_JOB_TYPE,
      status: created.status,
      input_json: JSON.stringify(ctx.input ?? {}),
      state_json: JSON.stringify(created.metadata ?? {}),
      result_json: null,
      error: created.error ?? null,
      message: created.message ?? null,
      poll_after_ms: created.poll_after_ms ? String(created.poll_after_ms) : null,
      city_id: ctx.city?.city_id ?? null,
      user_id: ctx.user?.user_id ?? null,
      service_id: "ai",
      model_id: ctx.metering?.model_id ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  /**
   * 读取图片任务。
   */
  private async requireImageJob(ctx: Context): Promise<AsyncJobRecord> {
    const table = ctx.db.async_jobs;
    if (!table) throw httpError(500, "AI async_jobs table is not initialized");
    const job_id = readOptionalString(ctx.input.job_id);
    if (!job_id) throw httpError(422, "job_id is required");
    const rows = await table.select({ job_id, job_type: IMAGE_GENERATE_JOB_TYPE });
    const row = rows[0];
    if (!row) throw httpError(404, `Image job not found: ${job_id}`);
    return rowToAsyncJobRecord(row);
  }

  /**
   * 把 async_jobs 记录注入 Provider 可读取的上下文。
   */
  private attachImageJobContext(ctx: Context, job: AsyncJobRecord): void {
    const image_job: AIImageJobContext = {
      record: job,
      input: parseRecordJson(job.input_json),
      state: parseRecordJson(job.state_json),
    };
    ctx.locals.ai_image_job = image_job;
    ctx.input = {
      ...parseRecordJson(job.input_json),
      ...ctx.input,
      job_id: job.job_id,
    };
  }

  /**
   * 将图片任务记录转成默认 result 返回。
   */
  private imageJobToResult(job: AsyncJobRecord): AIImageProviderResult {
    return {
      job_id: job.job_id,
      status: job.status === "fetching" ? "running" : job.status,
      result: job.status === "succeeded" ? parseImageMessage(job.result_json) : undefined,
      error: job.error ?? undefined,
      message: job.message ?? undefined,
      poll_after_ms: readOptionalNumber(job.poll_after_ms),
      metadata: parseRecordJson(job.state_json),
    };
  }

  // ========== OpenAI 兼容通路 ==========

  private async handleChatCompletions(ctx: Context): Promise<Response> {
    const body = ctx.input as Record<string, unknown>;
    const modelId = this.normalizeModelId(body.model);
    const initial_resolved = this.resolve({ model: modelId, mode: "openai" }, ctx.env);
    const { resolved, fallback_from, fallback_reason, fallback_media_type } = this.plan_text_execution(initial_resolved, ctx, "openai");
    const reasoning = resolved.model
      ? resolve_model_reasoning(resolved.model, body)
      : undefined;
    this.attachResolvedModel(ctx, resolved.model, "openai", { fallback_from, fallback_reason, fallback_media_type });
    ctx.input = body;
    attach_resolved_reasoning(ctx, reasoning);
    const started_at = Date.now();

    try {
      const output = await resolved.action(ctx);
      const provider_output = this.resolveProviderOutput(output);
      this.attachOutputMetering(ctx, provider_output.output, "openai", started_at);
      const resolved_charge = provider_output.charge ?? resolved.model?.bill?.(ctx, provider_output.output);
      const defer_charge = isResponse(provider_output.output) || isPromiseLike(resolved_charge);
      await this.handleCharge(ctx, resolved_charge, defer_charge);
      if (isResponse(provider_output.output)) return provider_output.output;
      return new Response(JSON.stringify(provider_output.output), { status: 200, headers: { "content-type": "application/json" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return new Response(JSON.stringify({ error: { message, type: "server_error" } }), { status, headers: { "content-type": "application/json" } });
    }
  }

  /**
   * 将解析出的模型写回原始 Context，供 hook / usage / charge 读取。
   */
  private attachResolvedModel(
    ctx: Context,
    model: ModelConfig | undefined,
    mode: string,
    routing?: { fallback_from?: string; fallback_reason?: AIRoutingFallbackReason; fallback_media_type?: string },
  ): void {
    if (!model) return;
    ctx.variant = { id: model.id, name: model.name, meta: model.meta };
    ctx.metering = {
      ...ctx.metering,
      provider_id: model.provider_id,
      model_id: model.id,
      upstream_model: typeof model.meta?.upstream_model === "string"
        ? model.meta.upstream_model
        : model.passthroughModel,
      request_count: ctx.metering?.request_count ?? 1,
      metadata: {
        ...(ctx.metering?.metadata ?? {}),
        mode,
        ...(routing?.fallback_from ? { fallback_from: routing.fallback_from } : {}),
        ...(routing?.fallback_reason ? { fallback_reason: routing.fallback_reason } : {}),
        ...(routing?.fallback_media_type ? { fallback_media_type: routing.fallback_media_type } : {}),
      },
    };
  }

  /**
   * AI 消费型 Action 的余额前置检查。
   *
   * 关键说明（中文）
   * - 默认只拦截已经欠费的用户，适配 AI 后置 usage 扣费
   * - admin 或没有用户归属的调用不产生用户扣费，也不做用户余额检查
   * - image/result、image/fetch、models 等非消费型 Action 不挂载该 hook
   */
  private async precheck(ctx: Context): Promise<void> {
    const user_id = ctx.user?.user_id;
    if (!user_id || !this.balance?.precheck) return;
    await this.balance.precheck(user_id);
  }

  /**
   * 从 action 输出里提取标准计量信息。
   */
  private attachOutputMetering(ctx: Context, output: unknown, mode: string, started_at: number): void {
    const usage = extractUsage(output);
    const normalized_usage = normalizeUsage(usage);
    const image_count = mode === "image"
      ? countImageOutputs(output) || ctx.metering?.image_count
      : ctx.metering?.image_count;

    ctx.metering = {
      ...ctx.metering,
      ...normalized_usage,
      ...(image_count ? { image_count } : {}),
      duration_ms: Date.now() - started_at,
      raw_usage: usage ?? ctx.metering?.raw_usage,
    };
  }

  /**
   * 拆包 Provider 返回值。
   *
   * 关键说明（中文）
   * - 新 Provider 可以返回 `{ output, charge }` 或 `{ response, charge }`。
   * - 老 Provider 继续直接返回 UIMessage / Response，保持兼容。
   */
  private resolveProviderOutput(value: unknown): ResolvedProviderOutput {
    if (isProviderChargedResponse(value)) {
      return {
        output: value.response,
        charge: value.charge,
      };
    }
    if (isProviderChargedOutput(value)) {
      return {
        output: value.output,
        charge: value.charge,
      };
    }
    return { output: value };
  }

  /**
   * 安排 AI 专用扣费。
   */
  private async handleCharge(
    ctx: Context,
    charge: AIProviderChargeLine | Promise<AIProviderChargeLine | undefined> | undefined,
    defer: boolean,
    idempotency_key?: string,
  ): Promise<void> {
    if (!charge || !this.balance) return;
    ctx.locals.ai_charge_handled = true;
    let charge_line: AIProviderChargeLine | undefined;
    let charge_user_id: string | undefined;
    const promise = Promise.resolve(charge)
      .then(async (line) => {
        charge_line = line;
        if (!line || line.credits <= 0) return;
        const user_id = line.user_id ?? ctx.user?.user_id;
        charge_user_id = user_id;
        if (!user_id) return;
        await this.balance?.charge({
          ...line,
          user_id,
          ...(idempotency_key ? { idempotency_key } : {}),
        });
      })
      .catch((error) => {
        console.error("[AIService] balance charge failed", {
          user_id: charge_user_id,
          service_id: ctx.service?.id,
          action_id: ctx.action?.id,
          model_id: ctx.metering?.model_id,
          provider_id: ctx.metering?.provider_id,
          credits: charge_line?.credits,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
    if (!defer) {
      await promise;
      return;
    }
    if (ctx.waitUntil) {
      try {
        ctx.waitUntil(promise);
        return;
      } catch {
        // 非 Worker 测试环境可能没有真实 ExecutionContext，继续走普通异步结算。
      }
    }
    void promise;
  }

  // ========== 模型列表 ==========

  static listModels(aiService: AIService, options: {
    env: EnvReader;
    identity: "guest" | "user" | "admin";
  }): PublicModel[] {
    return aiService.models.list_public({
      ...options,
      get_modalities: (model) => aiService.getModelModalities(model),
    });
  }
}
