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
 * - POST /v1/ai/stream           — CityModel LanguageModelV3 模型流
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
import type { AsyncJobRecord } from "../../types/AsyncJob.js";
import type {
  AIServiceOptions,
  ModelConfig,
  ModelActions,
  PublicModel,
} from "./types.js";
import type {
  AIBalanceBridge,
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
import { settle_response_charge } from "./charge-runtime.js";
import {
  create_city_language_model_stream,
  decode_city_language_model_request,
} from "./language-model-stream.js";
import type { CityRuntimeLanguageModelV3 } from "../../types/CityLanguageModelRuntime.js";
import {
  countImageOutputs,
  extractUsage,
  imageActionError,
  isImageProviderCreateResult,
  isImageProviderResult,
  isPromiseLike,
  isProviderChargedOutput,
  isProviderChargedResponse,
  isResponse,
  isStorableRemoteFilePart,
  normalizePositiveNumber,
  normalizeUsage,
  parseImageMessage,
  parseRecordJson,
  readFilePartFilename,
  readFilePartMediaType,
  readOptionalNumber,
  readOptionalString,
  rowToAsyncJobRecord,
  type ResolvedProviderOutput,
} from "./ai-service-values.js";

/** AIService 直接暴露的 action 模态列表。模型流与图片任务使用独立 handler。 */
const MODALITIES = ["text", "video", "tts", "asr"] as const;
/** 用户侧默认以 text 模态排序模型 */
const DEFAULT_MODEL_MODE = "text";
/** CityModel 原生 LanguageModelV3 运行模式。 */
const LANGUAGE_MODEL_MODE = "language_model";
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

/** 判断 Provider runtime 是否返回了可直接调用的 LanguageModelV3。 */
function is_language_model_v3(value: unknown): value is CityRuntimeLanguageModelV3 {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return model.specificationVersion === "v3" &&
    typeof model.doStream === "function" &&
    typeof model.doGenerate === "function";
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

    // `/stream` 是 CityModel 唯一模型流入口，不经过旧 UIMessage action。
    this.action("stream", async (ctx) => this.handleLanguageModelStream(ctx), {
      auth: ["user", "admin"],
    }).before((ctx) => this.precheck(ctx));

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
    if (mode === LANGUAGE_MODEL_MODE) {
      return model.language_model
        ? (ctx) => model.language_model?.create_language_model(ctx)
        : undefined;
    }
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
    if (model.language_model && !modalities.includes("stream")) modalities.push("stream");
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
    const reasoning = resolved.model && modality === "text"
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
      const charged_response = await this.handleCharge(
        ctx,
        resolved_charge,
        defer_charge,
        undefined,
        undefined,
        isResponse(output) ? output : undefined,
      );
      if (isResponse(output)) return charged_response ?? output;
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });
    }
  }

  /**
   * 执行 CityModel LanguageModelV3 模型流调用。
   *
   * 路由、fallback、reasoning 和计费仍由 AIService 统一拥有；transport 模块只负责
   * 调用最终模型并编码 SSE，避免把 Provider 决策泄漏到客户端。
   */
  private async handleLanguageModelStream(ctx: Context): Promise<Response> {
    const request = decode_city_language_model_request(ctx.input);
    ctx.input = {
      ...ctx.input,
      model: request.model_id,
      ...(request.reasoning_effort ? { reasoning_effort: request.reasoning_effort } : {}),
    };
    const initial_resolved = this.resolve({ model: request.model_id, mode: LANGUAGE_MODEL_MODE }, ctx.env);
    const routing = this.plan_text_execution(initial_resolved, ctx, LANGUAGE_MODEL_MODE);
    const resolved = routing.resolved;
    const reasoning = resolved.model ? resolve_model_reasoning(resolved.model, ctx.input) : undefined;
    this.attachResolvedModel(ctx, resolved.model, LANGUAGE_MODEL_MODE, routing);
    attach_resolved_reasoning(ctx, reasoning);
    const started_at = Date.now();

    const output = await resolved.action(ctx);
    if (!is_language_model_v3(output)) {
      throw httpError(500, "Model language runtime did not return LanguageModelV3");
    }
    const provider_options = resolved.model?.language_model?.build_provider_options?.(ctx, output);
    const execution = await create_city_language_model_stream({
      model: output,
      call: request.call,
      provider_options,
      signal: ctx.request?.signal,
    });
    const completion = execution.completion.then((part) => {
      if (part) this.attachOutputMetering(ctx, part, LANGUAGE_MODEL_MODE, started_at);
      return part;
    });
    const charge = resolved.model?.bill
      ? completion.then((part) => part ? resolved.model?.bill?.(ctx, part) : undefined)
      : undefined;
    const charged_response = await this.handleCharge(
      ctx,
      charge,
      true,
      undefined,
      undefined,
      execution.response,
    );
    return charged_response ?? execution.response;
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
        await this.handleCharge(
          ctx,
          charge,
          false,
          `ai_image:${job.job_id}`,
          job.user_id ?? undefined,
        );
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
      const charged_response = await this.handleCharge(
        ctx,
        resolved_charge,
        defer_charge,
        undefined,
        undefined,
        isResponse(provider_output.output) ? provider_output.output : undefined,
      );
      if (isResponse(provider_output.output)) return charged_response ?? provider_output.output;
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
    fallback_user_id?: string,
    response?: Response,
  ): Promise<Response | undefined> {
    if (!charge || !this.balance) return response;
    ctx.locals.ai_charge_handled = true;
    let charge_line: AIProviderChargeLine | undefined;
    let charge_user_id: string | undefined;
    const promise = Promise.resolve(charge)
      .then(async (line) => {
        charge_line = line;
        if (!line || line.credits <= 0) return;
        // 图片队列没有请求用户上下文时，必须回退到任务创建者，不能静默跳过扣费。
        const user_id = line.user_id ?? fallback_user_id ?? ctx.user?.user_id;
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
      return response;
    }
    if (ctx.waitUntil) {
      try {
        ctx.waitUntil(promise);
        return response;
      } catch {
        // 非 Worker 测试环境可能没有真实 ExecutionContext，继续走普通异步结算。
      }
    }
    if (response) return await settle_response_charge(response, promise);
    // Node 等无 ExecutionContext 环境下，普通异步计费必须在请求结束前可靠完成。
    await promise;
    return response;
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
