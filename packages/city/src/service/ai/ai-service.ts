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
  AIModelEnvRequirement,
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
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed"
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
  private modelMap = new Map<string, ModelConfig>();

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
      });
    }

    // 图片生成的任务式端点。SDK 通过 image_create / image_result 显式访问。
    this.action("image/create", async (ctx) => this.createImageJob(ctx), {
      auth: ["user", "admin"],
    });
    this.action("image/result", async (ctx) => this.readImageJob(ctx), {
      auth: ["user", "admin"],
    });
    this.action(IMAGE_FETCH_ACTION, async (ctx) => this.fetchImageJob(ctx), {
      auth: ["admin"],
    });

    // OpenAI 兼容端点
    this.action("chat/completions", async (ctx) => this.handleChatCompletions(ctx), {
      auth: ["user", "admin"],
    });

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
    const configs: ModelConfig[] = [];
    for (const input of inputs) {
      if (Array.isArray(input)) configs.push(...input);
      else configs.push(input);
    }
    for (const config of configs) {
      if (this.modelMap.has(config.id)) throw new Error(`Duplicate model: ${config.id}`);
      this.modelMap.set(config.id, config);
    }
    return this;
  }

  listModels(): ModelConfig[] {
    return [...this.modelMap.values()];
  }

  hasAction(): boolean {
    return this.modelMap.size > 0;
  }

  // ========== 模型匹配 ==========

  resolve(query: { model?: string; mode?: string }, env?: EnvReader): { model?: ModelConfig; action: ActionFn } {
    const { model: modelId, mode } = query;
    const isOpenAIMode = mode === "openai";

    if (modelId) {
      const model = this.modelMap.get(modelId);
      if (!model) throw httpError(422, `Unknown model: ${modelId}`);
      const action = isOpenAIMode ? this.resolveOpenAIAction(model) : this.getAction(model, mode);
      if (!action) throw httpError(422, `Model ${modelId} does not support mode: ${mode ?? "text"}`);
      return { model, action };
    }

    const candidates = this.listCandidateModels(mode, env);
    const defaultModel = candidates[0];
    if (defaultModel) {
      const action = isOpenAIMode ? this.resolveOpenAIAction(defaultModel) : this.getAction(defaultModel, mode);
      if (action) return { model: defaultModel, action };
    }

    if (this.modelMap.size > 0) {
      if (env) throw httpError(422, `No available model for mode: ${mode ?? DEFAULT_MODEL_MODE}`);
      throw httpError(422, `No action for mode: ${mode ?? DEFAULT_MODEL_MODE}`);
    }

    throw httpError(422, `No model registered`);
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

  private listCandidateModels(mode?: string, env?: EnvReader): ModelConfig[] {
    const candidates = [...this.modelMap.values()].filter((model) => {
      const action = mode === "openai" ? this.resolveOpenAIAction(model) : this.getAction(model, mode);
      return Boolean(action);
    });

    const readyCandidates = env
      ? candidates.filter((model) => this.getMissingEnv(model, env).length === 0)
      : candidates;

    return readyCandidates.sort((a, b) => this.compareModelPriority(a, b, mode ?? DEFAULT_MODEL_MODE));
  }

  private compareModelPriority(a: ModelConfig, b: ModelConfig, mode: string): number {
    const scoreDiff = this.getDefaultScore(b, mode) - this.getDefaultScore(a, mode);
    if (scoreDiff !== 0) return scoreDiff;
    return 0;
  }

  private getDefaultScore(model: ModelConfig, mode: string): number {
    const defaultModes = this.getDefaultModes(model);
    if (defaultModes.includes(mode)) return 3;
    if (defaultModes.includes(DEFAULT_MODEL_MODE)) return 2;
    if (defaultModes.length > 0) return 1;
    return 0;
  }

  private getDefaultModes(model: ModelConfig): string[] {
    const modalities = this.getModelModalities(model);
    if (model.default === true) return modalities;
    if (Array.isArray(model.default)) return model.default.filter((mode) => modalities.includes(mode));
    return [];
  }

  private getModelModalities(model: ModelConfig): string[] {
    const modalities = Object.keys(model.actions).filter((key) => model.actions[key] !== undefined);
    if (modalities.includes("image_create") && modalities.includes("image_fetch")) {
      modalities.push("image");
    }
    if (!modalities.includes("openai") && this.resolveOpenAIAction(model)) modalities.push("openai");
    return modalities.filter((mode) => mode !== "image_create" && mode !== "image_fetch" && mode !== "image_result");
  }

  private getModelEnvRequirements(model: ModelConfig): AIModelEnvRequirement[] {
    const requirements = model.env
      ? Object.entries(model.env)
      : model.envKey
        ? [[model.envKey, `${model.id} API Key`]]
        : [];

    return requirements.map(([key, description]) => ({
      key,
      description,
      required: true,
    }));
  }

  private getMissingEnv(model: ModelConfig, env: EnvReader): string[] {
    return this.getModelEnvRequirements(model)
      .filter((item) => item.required && !env(item.key))
      .map((item) => item.key);
  }

  // ========== SDK 通路 ==========

  private async handleModality(modality: Modality, ctx: Context): Promise<unknown | Response> {
    const resolved = this.resolve({ model: ctx.input.model as string | undefined, mode: modality }, ctx.env);
    this.attachResolvedModel(ctx, resolved.model, modality);
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
    const resolved = this.resolve({ model: ctx.input.model as string | undefined, mode: "image_create" }, ctx.env);
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
    const job = await this.requireImageJob(ctx);
    try {
      if (this.isTerminalImageJob(job)) return this.imageJobToResult(job);
      if (this.isImageJobPendingTimedOut(job)) {
        const output = this.createImageJobPendingTimeoutResult(job);
        await this.updateImageJobFromFetch(ctx, job, output);
        return output;
      }

      const model_id = job.model_id ?? readOptionalString(ctx.input.model);
      if (!model_id) throw httpError(422, "Image job is missing model_id");
      const model = this.modelMap.get(model_id);
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
      const should_charge = output.status === "succeeded" && Boolean(output.result) && !job.result_json;
      if (should_charge) {
        this.attachOutputMetering(ctx, output.result, "image", started_at);
      }
      await this.updateImageJobFromFetch(ctx, job, output);
      if (should_charge) {
        const charge = model.bill?.(ctx, output);
        await this.handleCharge(ctx, charge, isPromiseLike(charge));
      }
      if (output.status === "queued" || output.status === "running") {
        await this.enqueueImageFetch(ctx, job.job_id, output.poll_after_ms);
      }
      return output;
    } catch (error) {
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
    if (job.status !== "queued" && job.status !== "running") return false;
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
      status: job.status,
      result: job.status === "succeeded" ? parseImageMessage(job.result_json) : undefined,
      error: job.error ?? undefined,
      message: job.message ?? undefined,
      poll_after_ms: readOptionalNumber(job.poll_after_ms),
      metadata: parseRecordJson(job.state_json),
    };
  }

  /**
   * 按 provider fetch 输出更新图片任务。
   */
  private async updateImageJobFromFetch(ctx: Context, job: AsyncJobRecord, output: AIImageProviderFetchResult): Promise<void> {
    const table = ctx.db.async_jobs;
    if (!table) throw httpError(500, "AI async_jobs table is not initialized");
    await table.update({
      where: { job_id: job.job_id, job_type: IMAGE_GENERATE_JOB_TYPE },
      values: {
        status: output.status,
        state_json: JSON.stringify(output.metadata ?? parseRecordJson(job.state_json)),
        result_json: output.result ? JSON.stringify(output.result) : job.result_json ?? null,
        error: output.error ?? null,
        message: output.message ?? null,
        poll_after_ms: output.poll_after_ms ? String(output.poll_after_ms) : null,
        updated_at: new Date().toISOString(),
      },
    });
  }

  // ========== OpenAI 兼容通路 ==========

  private async handleChatCompletions(ctx: Context): Promise<Response> {
    const body = ctx.input as Record<string, unknown>;
    const modelId = body.model as string | undefined;
    const resolved = this.resolve({ model: modelId, mode: "openai" }, ctx.env);
    this.attachResolvedModel(ctx, resolved.model, "openai");
    ctx.input = body;
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
  private attachResolvedModel(ctx: Context, model: ModelConfig | undefined, mode: string): void {
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
      },
    };
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
  ): Promise<void> {
    if (!charge || !this.balance) return;
    ctx.locals.ai_charge_handled = true;
    const promise = Promise.resolve(charge)
      .then(async (line) => {
        if (!line || line.amount_microcredits <= 0) return;
        const user_id = line.user_id ?? ctx.user?.user_id;
        if (!user_id) return;
        await this.balance?.charge({
          ...line,
          user_id,
        });
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
    const { env, identity } = options;
    const includeAdminFields = identity === "admin";
    const items = identity === "admin"
      ? [...aiService.modelMap.values()]
      : [...aiService.modelMap.values()].filter((config) => aiService.getMissingEnv(config, env).length === 0);

    return items
      .sort((a, b) => aiService.compareModelPriority(a, b, DEFAULT_MODEL_MODE))
      .map((config) => aiService.toPublicModel(config, includeAdminFields));
  }

  private toPublicModel(config: ModelConfig, includeAdminFields = false): PublicModel {
    return {
      id: config.id,
      name: config.name,
      description: config.description ?? "",
      modalities: this.getModelModalities(config),
      tags: config.tags ?? [],
      meta: config.meta ?? {},
      ...(includeAdminFields
        ? {
            env_requirements: this.getModelEnvRequirements(config),
            default_modes: this.getDefaultModes(config),
          }
        : {}),
    };
  }
}
