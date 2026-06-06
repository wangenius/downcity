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
 * - POST /v1/ai/image            — 图片生成
 * - POST /v1/ai/video            — 视频生成
 * - POST /v1/ai/chat/completions — OpenAI 兼容端点
 * - GET  /v1/ai/models           — 模型列表
 */

import { Service, type Context } from "../service.js";
import { httpError } from "../../utils/helpers.js";
import type { ActionFn } from "../action.js";
import type {
  AIModelEnvRequirement,
  ModelConfig,
  ModelActions,
  PublicModel,
} from "./types.js";
import type {
  UserImageJobCreateResult,
  UserImageJobResult,
  UserImageJobStatus,
  UserImageJobStatusResult,
  UserImageResult,
} from "../../city/user/types.js";

/** AIService 支持的 SDK 通路模态列表 */
const MODALITIES = ["text", "stream", "image", "video", "tts", "asr"] as const;
/** 用户侧默认以 text 模态排序模型 */
const DEFAULT_MODEL_MODE = "text";

type Modality = (typeof MODALITIES)[number];
type EnvReader = (key: string) => string | undefined;

interface ImageJobRecord {
  /** 图片任务唯一 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: UserImageJobStatus;
  /** 原始图片生成输入。 */
  input: Record<string, unknown>;
  /** 成功时的图片结果。 */
  result?: UserImageResult;
  /** 失败时的错误信息。 */
  error?: string;
  /** 人类可读状态说明。 */
  message?: string;
  /** 任务创建时间。 */
  created_at: string;
  /** 任务更新时间。 */
  updated_at: string;
}

const IMAGE_JOB_POLL_AFTER_MS = 3000;

/**
 * 判断一个值是否为 HTTP Response。
 */
function isResponse(value: unknown): value is Response {
  return typeof value === "object" && value !== null && "status" in value && "headers" in value;
}

export class AIService extends Service {
  /** 模型注册表 */
  private modelMap = new Map<string, ModelConfig>();

  /** SDK 通路 action 映射（modality → action） */
  private modalityActions = new Map<string, ActionFn>();

  /** 图片任务状态表。 */
  private readonly image_jobs = new Map<string, ImageJobRecord>();

  constructor() {
    super({ id: "ai", name: "AI" });

    // 为每个 modality 注册 routing action
    for (const modality of MODALITIES) {
      this.action(modality, async (ctx) => this.handleModality(modality, ctx), {
        auth: ["user", "admin"],
      });
    }

    this.action("image/jobs/create", async (ctx) => this.createImageJob(ctx), {
      auth: ["user", "admin"],
    });
    this.action("image/jobs/status", async (ctx) => this.readImageJobStatus(ctx), {
      auth: ["user", "admin"],
    });
    this.action("image/jobs/result", async (ctx) => this.readImageJobResult(ctx), {
      auth: ["user", "admin"],
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
    if (!modalities.includes("openai") && this.resolveOpenAIAction(model)) modalities.push("openai");
    return modalities;
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
    const aiCtx: Context = { ...ctx, variant: resolved.model ? { id: resolved.model.id, name: resolved.model.name, meta: resolved.model.meta } : undefined };

    try {
      const output = await resolved.action(aiCtx);
      if (isResponse(output)) return output;
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });
    }
  }

  private create_image_job_id(): string {
    return `img_${crypto.randomUUID()}`;
  }

  private image_job_status_path(job_id: string): string {
    return `/v1/ai/image/jobs/status?job_id=${encodeURIComponent(job_id)}`;
  }

  private image_job_result_path(job_id: string): string {
    return `/v1/ai/image/jobs/result?job_id=${encodeURIComponent(job_id)}`;
  }

  private serialize_image_job_create(record: ImageJobRecord): UserImageJobCreateResult {
    return {
      job_id: record.job_id,
      status: record.status,
      status_path: this.image_job_status_path(record.job_id),
      result_path: this.image_job_result_path(record.job_id),
      ...(record.message ? { message: record.message } : {}),
      poll_after_ms: IMAGE_JOB_POLL_AFTER_MS,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private serialize_image_job_status(record: ImageJobRecord): UserImageJobStatusResult {
    return {
      job_id: record.job_id,
      status: record.status,
      ...(record.message ? { message: record.message } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.result ? { result: record.result } : {}),
      ...(record.status === "running" || record.status === "queued"
        ? { poll_after_ms: IMAGE_JOB_POLL_AFTER_MS }
        : {}),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private serialize_image_job_result(record: ImageJobRecord): UserImageJobResult {
    return {
      job_id: record.job_id,
      status: record.status,
      ...(record.result ? { result: record.result } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.message ? { message: record.message } : {}),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private require_image_job(input: Record<string, unknown>): ImageJobRecord {
    const job_id = String(input.job_id || "").trim();
    if (!job_id) throw httpError(422, "image job_id is required");
    const record = this.image_jobs.get(job_id);
    if (!record) throw httpError(404, `Unknown image job: ${job_id}`);
    return record;
  }

  private async createImageJob(ctx: Context): Promise<UserImageJobCreateResult> {
    const now = new Date().toISOString();
    const record: ImageJobRecord = {
      job_id: this.create_image_job_id(),
      status: "running",
      input: { ...ctx.input },
      message: "image job is running",
      created_at: now,
      updated_at: now,
    };
    this.image_jobs.set(record.job_id, record);

    void this.runImageJob(record, ctx);
    return this.serialize_image_job_create(record);
  }

  private async runImageJob(record: ImageJobRecord, ctx: Context): Promise<void> {
    try {
      const resolved = this.resolve({
        model: record.input.model as string | undefined,
        mode: "image",
      }, ctx.env);
      const image_ctx: Context = {
        ...ctx,
        input: record.input,
        locals: {},
        variant: resolved.model
          ? {
              id: resolved.model.id,
              name: resolved.model.name,
              meta: resolved.model.meta,
            }
          : undefined,
      };
      const output = await resolved.action(image_ctx);
      if (isResponse(output)) {
        throw new Error("Image job action returned an HTTP Response");
      }
      record.status = "succeeded";
      record.result = output as UserImageResult;
      record.message = "image job succeeded";
      record.updated_at = new Date().toISOString();
    } catch (error) {
      record.status = "failed";
      record.error = error instanceof Error ? error.message : String(error);
      record.message = "image job failed";
      record.updated_at = new Date().toISOString();
    }
  }

  private readImageJobStatus(ctx: Context): UserImageJobStatusResult {
    return this.serialize_image_job_status(this.require_image_job(ctx.input));
  }

  private readImageJobResult(ctx: Context): UserImageJobResult {
    return this.serialize_image_job_result(this.require_image_job(ctx.input));
  }

  // ========== OpenAI 兼容通路 ==========

  private async handleChatCompletions(ctx: Context): Promise<Response> {
    const body = ctx.input as Record<string, unknown>;
    const modelId = body.model as string | undefined;
    const resolved = this.resolve({ model: modelId, mode: "openai" }, ctx.env);
    const aiCtx: Context = { ...ctx, input: body, variant: resolved.model ? { id: resolved.model.id, name: resolved.model.name, meta: resolved.model.meta } : undefined };

    try {
      const output = await resolved.action(aiCtx);
      if (isResponse(output)) return output;
      return new Response(JSON.stringify(output), { status: 200, headers: { "content-type": "application/json" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return new Response(JSON.stringify({ error: { message, type: "server_error" } }), { status, headers: { "content-type": "application/json" } });
    }
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
