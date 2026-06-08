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
import { httpError, randomSecret } from "../../utils/helpers.js";
import type { ActionFn } from "../action.js";
import { sqliteAIImageJobs } from "./schema.js";
import type { UIMessage } from "ai";
import type {
  AIModelEnvRequirement,
  ModelConfig,
  ModelActions,
  PublicModel,
} from "./types.js";
import type {
  AIImageJobRecord,
  AIImageJobStepContext,
  AIImageJobStepResult,
  AIImageJobStepState,
  UserImageJobCreateResult,
  UserImageJobResult,
} from "./job-types.js";

/** AIService 直接暴露的 SDK 通路模态列表。 */
const MODALITIES = ["text", "stream", "image", "video", "tts", "asr"] as const;
/** 用户侧默认以 text 模态排序模型 */
const DEFAULT_MODEL_MODE = "text";
/** 图片任务轮询建议间隔 */
const IMAGE_JOB_POLL_AFTER_MS = 2_000;

type Modality = (typeof MODALITIES)[number];
type EnvReader = (key: string) => string | undefined;

/**
 * 判断一个值是否为 HTTP Response。
 */
function isResponse(value: unknown): value is Response {
  return typeof value === "object" && value !== null && "status" in value && "headers" in value;
}

/**
 * 读取必填字符串。
 */
function readRequiredString(value: unknown, label: string): string {
  const text = readOptionalString(value);
  if (!text) throw httpError(422, `${label} is required`);
  return text;
}

/**
 * 读取可选字符串。
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 归一化图片任务输出。
 */
async function normalizeImageJobOutput(output: unknown): Promise<UIMessage> {
  if (!isResponse(output)) return output as UIMessage;
  const text = await output.text();
  if (!output.ok) {
    throw httpError(output.status, text || output.statusText || "image generation failed");
  }
  return text ? JSON.parse(text) as UIMessage : {} as UIMessage;
}

/**
 * 解析已持久化的图片任务结果。
 */
function parseImageJobResult(raw: string): UIMessage | undefined {
  try {
    return JSON.parse(raw) as UIMessage;
  } catch {
    return undefined;
  }
}

/**
 * 解析可恢复任务状态。
 */
function parseImageJobStepState(raw: string | null | undefined): AIImageJobStepState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as AIImageJobStepState
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 解析已持久化的图片任务输入。
 */
function parseImageJobInput(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/**
 * 判断 provider 是否返回了图片任务推进结果。
 */
function isImageJobStepResult(value: unknown): value is AIImageJobStepResult {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "running" || status === "succeeded" || status === "failed";
}

/**
 * 把类型化任务记录转成 TableApi 使用的普通行。
 */
function recordToRow(record: Partial<AIImageJobRecord>): Record<string, unknown> {
  return { ...record };
}

/**
 * 把 TableApi 普通行转成图片任务记录。
 */
function rowToImageJobRecord(row: Record<string, unknown>): AIImageJobRecord {
  return {
    job_id: String(row.job_id ?? ""),
    status: readJobStatus(row.status),
    input_json: String(row.input_json ?? "{}"),
    result_json: readNullableString(row.result_json),
    error: readNullableString(row.error),
    message: readNullableString(row.message),
    town_id: readNullableString(row.town_id),
    user_id: readNullableString(row.user_id),
    model_id: readNullableString(row.model_id),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * 读取任务状态。
 */
function readJobStatus(value: unknown): AIImageJobRecord["status"] {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed"
    ? value
    : "failed";
}

/**
 * 读取可空字符串字段。
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class AIService extends Service {
  /** 模型注册表 */
  private modelMap = new Map<string, ModelConfig>();

  /** SDK 通路 action 映射（modality → action） */
  private modalityActions = new Map<string, ActionFn>();

  constructor() {
    super({ id: "ai", name: "AI", tables: { image_jobs: sqliteAIImageJobs } });

    // 为每个 modality 注册 routing action
    for (const modality of MODALITIES) {
      this.action(modality, async (ctx) => this.handleModality(modality, ctx), {
        auth: ["user", "admin"],
      });
    }

    // 图片生成的任务式端点。SDK 的 client.ai.image() 默认走这里，避免长连接。
    this.action("image/create", async (ctx) => this.createImageJob(ctx), {
      auth: ["user", "admin"],
    });
    this.action("image/result", async (ctx) => this.readImageJob(ctx), {
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

  // ========== 图片任务通路 ==========

  private async createImageJob(ctx: Context): Promise<UserImageJobCreateResult> {
    const resolved = this.resolve({ model: ctx.input.model as string | undefined, mode: "image" }, ctx.env);
    const now = new Date().toISOString();
    const job_id = `img_${randomSecret(12)}`;
    const record: AIImageJobRecord = {
      job_id,
      status: "queued",
      input_json: JSON.stringify(ctx.input),
      result_json: null,
      error: null,
      message: "queued",
      town_id: ctx.town?.town_id ?? readOptionalString(ctx.input.town_id),
      user_id: ctx.user?.user_id ?? null,
      model_id: resolved.model?.id ?? null,
      created_at: now,
      updated_at: now,
    };

    await this.imageJobTable(ctx).insert(recordToRow(record));

    const job_ctx: Context = {
      ...ctx,
      input: { ...ctx.input },
      locals: {},
      output: undefined,
      error: undefined,
      variant: resolved.model ? { id: resolved.model.id, name: resolved.model.name, meta: resolved.model.meta } : undefined,
    };
    if (!resolved.model?.actions.image_job) {
      const promise = this.runImageJob(job_id, job_ctx);
      if (ctx.waitUntil) ctx.waitUntil(promise);
      else void promise;
    }

    return {
      job_id,
      status: "queued",
      poll_after_ms: IMAGE_JOB_POLL_AFTER_MS,
    };
  }

  private async readImageJob(ctx: Context): Promise<UserImageJobResult> {
    const job_id = readRequiredString(ctx.input.job_id, "job_id");
    const record = await this.getImageJob(ctx, job_id);
    if (!record) throw httpError(404, `Image job not found: ${job_id}`);
    this.ensureImageJobAccess(ctx, record);
    if (record.status === "queued" || record.status === "running") {
      const advanced = await this.advanceImageJob(ctx, record);
      return this.toImageJobResult(advanced);
    }
    return this.toImageJobResult(record);
  }

  private async advanceImageJob(ctx: Context, record: AIImageJobRecord): Promise<AIImageJobRecord> {
    const input = parseImageJobInput(record.input_json);
    const resolved = this.resolve({ model: input.model as string | undefined, mode: "image" }, ctx.env);
    const step_action = resolved.model?.actions.image_job;
    if (!step_action) return record;

    const step_ctx: Context = {
      ...ctx,
      input,
      locals: {
        ...ctx.locals,
        image_job: {
          job_id: record.job_id,
          status: record.status,
          state: parseImageJobStepState(record.result_json),
        } satisfies AIImageJobStepContext,
      },
      variant: resolved.model ? { id: resolved.model.id, name: resolved.model.name, meta: resolved.model.meta } : undefined,
    };
    const output = await step_action(step_ctx);
    if (!isImageJobStepResult(output)) {
      throw httpError(500, "image_job action returned invalid result");
    }

    const updated_at = new Date().toISOString();
    if (output.status === "succeeded") {
      if (!output.result) throw httpError(500, "image_job action succeeded without result");
      await this.updateImageJob(ctx, record.job_id, {
        status: "succeeded",
        result_json: JSON.stringify(output.result),
        error: null,
        message: output.message ?? "succeeded",
        updated_at,
      });
    } else if (output.status === "failed") {
      await this.updateImageJob(ctx, record.job_id, {
        status: "failed",
        error: output.error ?? output.message ?? "image generation failed",
        message: output.message ?? "failed",
        updated_at,
      });
    } else {
      await this.updateImageJob(ctx, record.job_id, {
        status: "running",
        result_json: output.state ? JSON.stringify(output.state) : record.result_json,
        error: null,
        message: output.message ?? "running",
        updated_at,
      });
    }

    const next = await this.getImageJob(ctx, record.job_id);
    return next ?? record;
  }

  private async runImageJob(job_id: string, ctx: Context): Promise<void> {
    try {
      await this.updateImageJob(ctx, job_id, {
        status: "running",
        message: "running",
        error: null,
        updated_at: new Date().toISOString(),
      });

      const resolved = this.resolve({ model: ctx.input.model as string | undefined, mode: "image" }, ctx.env);
      const aiCtx: Context = {
        ...ctx,
        variant: resolved.model ? { id: resolved.model.id, name: resolved.model.name, meta: resolved.model.meta } : undefined,
      };
      const output = await resolved.action(aiCtx);
      const result = await normalizeImageJobOutput(output);

      await this.updateImageJob(ctx, job_id, {
        status: "succeeded",
        result_json: JSON.stringify(result),
        error: null,
        message: "succeeded",
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.updateImageJob(ctx, job_id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        message: "failed",
        updated_at: new Date().toISOString(),
      });
    }
  }

  private imageJobTable(ctx: Context) {
    const table = ctx.db.image_jobs;
    if (!table) throw httpError(500, "AI image job table is not initialized");
    return table;
  }

  private async getImageJob(ctx: Context, job_id: string): Promise<AIImageJobRecord | undefined> {
    const rows = await this.imageJobTable(ctx).select({ job_id });
    return rows[0] ? rowToImageJobRecord(rows[0]) : undefined;
  }

  private async updateImageJob(
    ctx: Context,
    job_id: string,
    values: Partial<AIImageJobRecord>,
  ): Promise<void> {
    await this.imageJobTable(ctx).update({ where: { job_id }, values: recordToRow(values) });
  }

  private ensureImageJobAccess(ctx: Context, record: AIImageJobRecord): void {
    if (ctx.identity?.kind !== "user") return;
    if (record.town_id && ctx.town?.town_id && record.town_id !== ctx.town.town_id) {
      throw httpError(404, `Image job not found: ${record.job_id}`);
    }
    if (record.user_id && ctx.user?.user_id && record.user_id !== ctx.user.user_id) {
      throw httpError(404, `Image job not found: ${record.job_id}`);
    }
  }

  private toImageJobResult(record: AIImageJobRecord): UserImageJobResult {
    const result = record.status === "succeeded" && record.result_json
      ? parseImageJobResult(record.result_json)
      : undefined;
    return {
      job_id: record.job_id,
      status: record.status,
      result,
      error: record.error ?? undefined,
      message: record.message ?? undefined,
      poll_after_ms: IMAGE_JOB_POLL_AFTER_MS,
    };
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
