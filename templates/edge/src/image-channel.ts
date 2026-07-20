/**
 * 图片 AIChannel 实现。
 *
 * 关键点（中文）
 * - city.ai.image_create() / image_result() 的统一结果协议是 AI SDK UIMessage。
 * - AIService 使用内置 async_jobs 表持久化任务状态，AIChannel 不管理任务存储。
 * - image_create() 创建或启动上游任务；image_fetch() 从 AIService 注入的任务上下文读取 state 并查询上游结果。
 * - OpenAI / 302、Gemini、Luchi 三种图片 Channel 都继承 AIChannel 基类。
 * - 不同上游的同步响应、Gemini content parts、Luchi 异步 job 都在这里归一成 file parts。
 * - 第一版只支持 JSON / URL / data URL，不处理 multipart 本地文件上传。
 */

import {
  AIChannel,
  type AIChannelActionInput,
  type AIImageCreateResult,
  type AIImageResult,
  buildImageMessage,
  readErrorMessage,
  readJsonResponse,
  read_required_env,
  readString,
  stripUndefined,
  toRecord,
  trimTrailingSlash,
} from "@downcity/city";

// ===========================================================================
// 类型
// ===========================================================================

/** 图片生成消息内容中的文本片段。 */
export interface ImageTextContent {
  /** 内容类型。 */
  type: "text";
  /** 文本内容。 */
  text: string;
}

/** 图片生成消息内容中的图片片段。 */
export interface ImageFileContent {
  /** 内容类型。 */
  type: "image";
  /** 远程图片 URL。 */
  url?: string;
  /** data URL 图片内容。 */
  data_url?: string;
  /** 图片 MIME 类型。 */
  media_type?: string;
}

/** 图片生成消息内容片段。 */
export type ImageContent = ImageTextContent | ImageFileContent;

/** 图片生成上下文消息。 */
export interface ImageMessage {
  /** 消息角色。 */
  role: "system" | "user" | "assistant";
  /** 消息内容。 */
  content: ImageContent[];
}

/** AIService image action 输入。 */
export interface ImageActionInput extends Record<string, unknown> {
  /** 上游或 City 模型 ID。 */
  model?: string;
  /** 单句快捷提示词。 */
  prompt?: string;
  /** 多轮或多模态上下文。 */
  messages?: ImageMessage[];
  /** 生成图片数量。 */
  n?: number;
  /** 生成图片数量，兼容 Luchi 的 count 命名。 */
  count?: number;
  /** 图片尺寸，例如 `1024x1024`。 */
  size?: string;
  /** 图片宽高比，例如 `1:1`。 */
  aspect_ratio?: string;
  /** 图片宽高比，兼容 Luchi 的 ratio 命名。 */
  ratio?: string;
  /** 图片质量，例如 `standard`、`hd`、`ultra`、`4k`。 */
  quality?: string;
  /** 随机种子。 */
  seed?: number;
  /** 业务侧任务 ID，用于异步图片任务幂等和恢复。 */
  client_job_id?: string;
  /** 上游私有参数。 */
  provider_options?: Record<string, unknown>;
}

/** OpenAI / 302 images API Channel 配置。 */
export interface OpenAIImageChannelOptions {
  /** Channel 唯一 ID。 */
  id: string;
  /** API Key 环境变量。 */
  env_key: string;
  /** OpenAI-compatible base URL，通常包含 `/v1`。 */
  base_url: string;
  /** 默认上游模型 ID。 */
  /** 图片生成路径。 */
  generation_path?: string;
  /** provider_options 中读取私有参数的 key，默认 `openai`。 */
  provider_options_key?: string;
}

/** Gemini 图片 Channel 配置。 */
export interface GeminiImageChannelOptions {
  /** Channel 唯一 ID。 */
  id: string;
  /** API Key 环境变量。 */
  env_key: string;
  /** Gemini API base URL。 */
  base_url?: string;
}

/** Luchi 图片 Channel 配置。 */
export interface LuchiImageChannelOptions {
  /** Channel 唯一 ID。 */
  id: string;
  /** Luchi 长期 API Key 环境变量。 */
  env_key: string;
  /** Luchi image API base URL。 */
  base_url?: string;
  /** 轮询间隔毫秒。 */
  poll_interval_ms?: number;
  /** 最大轮询次数。 */
  max_polls?: number;
}

interface ExtractedImage {
  /** 图片 URL 或 data URL。 */
  url: string;
  /** 图片 MIME 类型。 */
  media_type: string;
  /** 文件名。 */
  filename?: string;
}

interface RuntimeImageJobContext {
  /** 图片任务 ID。 */
  job_id: string;
  /** image_create 时的原始输入。 */
  input: ImageActionInput;
  /** 创建任务时的用户 ID，用于后台计费归属。 */
  user_id?: string;
  /** 创建任务时的 city ID，用于结果元数据。 */
  city_id?: string;
  /** 上游模型 ID。 */
  upstream_model: string;
  /** image_create 保存的 provider state。 */
  state: Record<string, unknown>;
}

const DEFAULT_IMAGE_MEDIA_TYPE = "image/png";

// ===========================================================================
// OpenAI / 302 images API Channel
// ===========================================================================

/** OpenAI / 302 images API 图片 Channel。 */
export class OpenAIImageChannel extends AIChannel {
  private readonly generation_path: string;
  private readonly provider_options_key: string;

  constructor(options: OpenAIImageChannelOptions) {
    super({
      id: options.id,
      env_key: options.env_key,
      base_url: options.base_url,
    });
    this.generation_path = options.generation_path ?? "/images/generations";
    this.provider_options_key = options.provider_options_key ?? "openai";
  }

  async image_create(input: AIChannelActionInput): Promise<AIImageCreateResult> {
    const upstream_model = input.model.upstream_model;
    const job_id = `openai_img_${crypto.randomUUID()}`;
    return {
      job_id,
      status: "running",
      message: "running",
      poll_after_ms: 1000,
      metadata: {
        provider: this.id,
        provider_options_key: this.provider_options_key,
        upstream_model,
      },
    };
  }

  async image_fetch(input: AIChannelActionInput): Promise<AIImageResult> {
    const job = readImageJobContext(input);
    try {
      const api_key = read_required_env(input, this.env_key ?? "");
      const provider_options = readProviderOptions(job.input, this.provider_options_key);
      const body = stripUndefined({
        model: job.upstream_model,
        prompt: extractPrompt(job.input),
        n: readImageCount(job.input),
        size: job.input.size,
        seed: job.input.seed,
        response_format: "b64_json",
        ...provider_options,
      });

      const response = await fetch(`${trimTrailingSlash(this.base_url ?? "")}${this.generation_path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      const raw = pickMetadata(data, ["usage", "created"]);
      return {
        job_id: job.job_id,
        status: "succeeded",
        message: "succeeded",
        result: buildImageMessage(input, extractImagesFromOpenAIResponse(data), {
          provider: this.id,
          provider_options_key: this.provider_options_key,
          upstream_model: job.upstream_model,
          city_id: job.city_id,
          user_id: job.user_id,
          raw,
        }),
        metadata: {
          provider: this.id,
          provider_options_key: this.provider_options_key,
          upstream_model: job.upstream_model,
          user_id: job.user_id,
          city_id: job.city_id,
          raw,
        },
      };
    } catch (error) {
      return failedImageFetch(job, error);
    }
  }
}

// ===========================================================================
// Gemini generateContent Channel
// ===========================================================================

/** Gemini generateContent 图片 Channel。 */
export class GeminiImageChannel extends AIChannel {
  private readonly api_base_url: string;

  constructor(options: GeminiImageChannelOptions) {
    super({
      id: options.id,
      env_key: options.env_key,
      base_url: options.base_url ?? "https://generativelanguage.googleapis.com/v1beta",
    });
    this.api_base_url = options.base_url ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  async image_create(input: AIChannelActionInput): Promise<AIImageCreateResult> {
    const upstream_model = input.model.upstream_model;
    const job_id = `gemini_img_${crypto.randomUUID()}`;
    return {
      job_id,
      status: "running",
      message: "running",
      poll_after_ms: 1000,
      metadata: { provider: this.id, upstream_model },
    };
  }

  async image_fetch(input: AIChannelActionInput): Promise<AIImageResult> {
    const job = readImageJobContext(input);
    try {
      const api_key = read_required_env(input, this.env_key ?? "");
      const provider_options = readProviderOptions(job.input, "gemini");
      const body = stripUndefined({
        contents: toGeminiContents(job.input),
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(toRecord(provider_options.generationConfig) ?? {}),
        },
        ...omitKeys(provider_options, ["generationConfig"]),
      });

      const response = await fetch(`${trimTrailingSlash(this.api_base_url)}/models/${encodeURIComponent(job.upstream_model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": api_key,
        },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      const raw = pickMetadata(data, ["usageMetadata", "promptFeedback"]);
      return {
        job_id: job.job_id,
        status: "succeeded",
        message: "succeeded",
        result: buildImageMessage(input, extractImagesFromGeminiResponse(data), {
          provider: this.id,
          upstream_model: job.upstream_model,
          city_id: job.city_id,
          user_id: job.user_id,
          raw,
        }),
        metadata: {
          provider: this.id,
          upstream_model: job.upstream_model,
          user_id: job.user_id,
          city_id: job.city_id,
          raw,
        },
      };
    } catch (error) {
      return failedImageFetch(job, error);
    }
  }
}

// ===========================================================================
// Luchi 异步 job Channel
// ===========================================================================

/** Luchi 异步 job 图片 Channel。 */
export class LuchiImageChannel extends AIChannel {
  private readonly api_base_url: string;
  private readonly poll_interval_ms: number;
  private readonly max_polls: number;

  constructor(options: LuchiImageChannelOptions) {
    super({
      id: options.id,
      env_key: options.env_key,
      base_url: options.base_url ?? "https://image.luchikey.com",
    });
    this.api_base_url = options.base_url ?? "https://image.luchikey.com";
    this.poll_interval_ms = options.poll_interval_ms ?? 3000;
    this.max_polls = options.max_polls ?? 60;
  }

  async image_create(action: AIChannelActionInput): Promise<AIImageCreateResult> {
    const input = normalizeImageActionInput(action.input);
    const api_key = read_required_env(action, this.env_key ?? "");
    const upstream_model = action.model.upstream_model;
    const job_id = await createLuchiJob({
      input,
      api_key,
      base_url: this.api_base_url,
      upstream_model,
    });
    return {
      job_id,
      status: "running",
      message: "running",
      poll_after_ms: this.poll_interval_ms,
      metadata: { provider: this.id, upstream_model },
    };
  }

  async image_fetch(input: AIChannelActionInput): Promise<AIImageResult> {
    const job = readImageJobContext(input);
    const api_key = read_required_env(input, this.env_key ?? "");
    const data = await readLuchiJob({
      base_url: this.api_base_url,
      api_key,
      job_id: job.job_id,
    });
    const status = readJobStatus(data);
    if (["succeeded", "success", "completed", "done"].includes(status)) {
      const raw = pickMetadata(data, ["status", "usage", "error"]);
      return {
        job_id: job.job_id,
        status: "succeeded",
        message: "succeeded",
        result: buildImageMessage(input, extractImagesFromLuchiResponse(data, this.api_base_url), {
          provider: this.id,
          upstream_model: job.upstream_model,
          city_id: job.city_id,
          user_id: job.user_id,
          job_id: job.job_id,
          raw,
        }),
        metadata: {
          provider: this.id,
          upstream_model: job.upstream_model,
          user_id: job.user_id,
          city_id: job.city_id,
          raw,
        },
      };
    }
    if (["failed", "failure", "error", "cancelled", "canceled"].includes(status)) {
      return {
        job_id: job.job_id,
        status: "failed",
        message: "failed",
        error: readErrorMessage(data) || `Luchi image job failed: ${job.job_id}`,
        metadata: {
          provider: this.id,
          upstream_model: job.upstream_model,
          user_id: job.user_id,
          city_id: job.city_id,
        },
      };
    }
    return {
      job_id: job.job_id,
      status: "running",
      message: "running",
      poll_after_ms: this.poll_interval_ms,
      metadata: {
        provider: this.id,
        upstream_model: job.upstream_model,
        user_id: job.user_id,
        city_id: job.city_id,
        upstream_status: status || "running",
        max_polls: this.max_polls,
      },
    };
  }
}

// ===========================================================================
// 图片输入解析
// ===========================================================================

function normalizeImageActionInput(input: unknown): ImageActionInput {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as ImageActionInput
    : {};
}

function readImageJobContext(input: AIChannelActionInput): RuntimeImageJobContext {
  const value = input.image_job;
  const record = toRecord(value?.record);
  const state = toRecord(value?.state) ?? {};
  return {
    job_id: readString(record?.job_id) || readString(input.input.job_id),
    input: normalizeImageActionInput(value?.input),
    user_id: readString(record?.user_id) || readString(state.user_id),
    city_id: readString(record?.city_id) || readString(state.city_id),
    upstream_model: readString(state.upstream_model) || input.model.upstream_model,
    state,
  };
}

function failedImageFetch(job: RuntimeImageJobContext, error: unknown): AIImageResult {
  return {
    job_id: job.job_id,
    status: "failed",
    message: "failed",
    error: error instanceof Error ? error.message : String(error),
    metadata: {
      user_id: job.user_id,
      city_id: job.city_id,
      upstream_model: job.upstream_model,
    },
  };
}

function extractPrompt(input: ImageActionInput): string {
  const direct_prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (direct_prompt) return direct_prompt;

  const lines: string[] = [];
  for (const message of input.messages ?? []) {
    for (const content of message.content ?? []) {
      if (content?.type === "text" && content.text.trim()) {
        lines.push(content.text.trim());
      }
    }
  }
  return lines.join("\n\n").trim();
}

function extractReferenceImages(input: ImageActionInput): Array<{ url: string; media_type?: string }> {
  const out: Array<{ url: string; media_type?: string }> = [];
  for (const message of input.messages ?? []) {
    for (const content of message.content ?? []) {
      if (content?.type !== "image") continue;
      const url = String(content.data_url || content.url || "").trim();
      if (!url) continue;
      out.push({
        url,
        ...(content.media_type ? { media_type: content.media_type } : {}),
      });
    }
  }
  return out;
}

function readImageCount(input: ImageActionInput): number | undefined {
  return input.count ?? input.n;
}

function readProviderOptions(input: ImageActionInput, key: string): Record<string, unknown> {
  const options = toRecord(input.provider_options);
  if (!options) return {};
  const scoped = toRecord(options[key]);
  return scoped ?? {};
}

// ===========================================================================
// Gemini 内容转换
// ===========================================================================

function toGeminiContents(input: ImageActionInput): Array<Record<string, unknown>> {
  const messages = input.messages?.length
    ? input.messages
    : [{
        role: "user" as const,
        content: [{ type: "text" as const, text: extractPrompt(input) }],
      }];

  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: message.content
      .map((content) => toGeminiPart(content))
      .filter((part): part is Record<string, unknown> => part !== null),
  }));
}

function toGeminiPart(content: ImageContent): Record<string, unknown> | null {
  if (content.type === "text") return { text: content.text };
  const data_url = String(content.data_url || "").trim();
  if (data_url) {
    const parsed = parseDataUrl(data_url);
    if (parsed) {
      return {
        inlineData: {
          mimeType: content.media_type || parsed.media_type,
          data: parsed.data,
        },
      };
    }
  }
  const url = String(content.url || "").trim();
  if (!url) return null;
  return {
    fileData: {
      mimeType: content.media_type || DEFAULT_IMAGE_MEDIA_TYPE,
      fileUri: url,
    },
  };
}

// ===========================================================================
// 图片响应提取
// ===========================================================================

function extractImagesFromOpenAIResponse(data: unknown): ExtractedImage[] {
  const record = toRecord(data);
  const items = Array.isArray(record?.data) ? record.data : [];
  return items
    .map((item, index) => {
      const item_record = toRecord(item);
      if (!item_record) return null;
      return imageFromRecord(item_record, `image-${index + 1}.png`);
    })
    .filter((item): item is ExtractedImage => item !== null);
}

function extractImagesFromGeminiResponse(data: unknown): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const candidates = toRecord(data)?.candidates;
  if (!Array.isArray(candidates)) return out;

  for (const candidate of candidates) {
    const parts = toRecord(toRecord(candidate)?.content)?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const inline_data = toRecord(toRecord(part)?.inlineData) ?? toRecord(toRecord(part)?.inline_data);
      if (!inline_data) continue;
      const data_value = readString(inline_data.data);
      if (!data_value) continue;
      const media_type = readString(inline_data.mimeType) || readString(inline_data.mime_type) || DEFAULT_IMAGE_MEDIA_TYPE;
      out.push({
        url: toDataUrl(media_type, data_value),
        media_type,
        filename: `image-${out.length + 1}.${extensionFromMediaType(media_type)}`,
      });
    }
  }
  return out;
}

function extractImagesFromLuchiResponse(data: unknown, base_url: string): ExtractedImage[] {
  const record = toRecord(data);
  const envelope_data = toRecord(record?.data);
  const result = toRecord(envelope_data?.result) ?? toRecord(record?.result) ?? envelope_data ?? record;
  const arrays = [
    result?.data,
    result?.images,
    envelope_data?.images,
    record?.images,
  ];
  for (const candidate of arrays) {
    if (!Array.isArray(candidate)) continue;
    const images = candidate
      .map((item, index) => imageFromRecord(toRecord(item), `image-${index + 1}.png`))
      .map((item) => normalizeExtractedImageUrl(item, base_url))
      .filter((item): item is ExtractedImage => item !== null);
    if (images.length > 0) return images;
  }

  const single = normalizeExtractedImageUrl(imageFromRecord(result, "image-1.png"), base_url);
  return single ? [single] : [];
}

function normalizeExtractedImageUrl(image: ExtractedImage | null, base_url: string): ExtractedImage | null {
  if (!image) return null;
  if (/^(https?:|data:)/i.test(image.url)) return image;
  if (!image.url.startsWith("/")) return image;
  return {
    ...image,
    url: `${trimTrailingSlash(base_url)}${image.url}`,
  };
}

function imageFromRecord(record: Record<string, unknown> | null | undefined, fallback_filename: string): ExtractedImage | null {
  if (!record) return null;
  const media_type = readString(record.media_type) || readString(record.mime_type) || readString(record.mimeType) || DEFAULT_IMAGE_MEDIA_TYPE;
  const b64 = readString(record.b64_json) || readString(record.base64) || readString(record.data);
  if (b64) {
    return {
      url: b64.startsWith("data:") ? b64 : toDataUrl(media_type, b64),
      media_type,
      filename: readString(record.filename) || fallback_filename,
    };
  }
  const direct_url = readString(record.url) || readString(record.image_url);
  if (!direct_url) return null;
  return {
    url: direct_url,
    media_type,
    filename: readString(record.filename) || fallback_filename,
  };
}

function pickMetadata(value: unknown, keys: string[]): Record<string, unknown> {
  const record = toRecord(value);
  if (!record) return {};
  return Object.fromEntries(keys.map((key) => [key, record[key]]).filter(([, item]) => item !== undefined));
}

function omitKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
}

// ===========================================================================
// Luchi 异步 job
// ===========================================================================

async function createLuchiJob(params: {
  input: ImageActionInput;
  api_key: string;
  base_url: string;
  upstream_model: string;
}): Promise<string> {
  const provider_options = readProviderOptions(params.input, "luchi");
  const reference_images = extractReferenceImages(params.input);
  const body = stripUndefined({
    model: params.upstream_model,
    prompt: extractPrompt(params.input),
    ratio: params.input.ratio ?? params.input.aspect_ratio,
    quality: params.input.quality,
    count: readImageCount(params.input),
    seed: params.input.seed,
    client_job_id: params.input.client_job_id,
    ...provider_options,
  });
  const has_reference_images = reference_images.length > 0;
  const create_path = has_reference_images
    ? "/api/relay/image-jobs/edits"
    : "/api/relay/image-jobs/generations";
  const create_body = has_reference_images
    ? createLuchiEditFormData(body, reference_images)
    : JSON.stringify(body);
  const create_headers: Record<string, string> = has_reference_images
    ? { Authorization: `Bearer ${params.api_key}` }
    : {
        Authorization: `Bearer ${params.api_key}`,
        "Content-Type": "application/json",
      };

  const create_response = await fetch(`${trimTrailingSlash(params.base_url)}${create_path}`, {
    method: "POST",
    headers: create_headers,
    body: create_body,
  });
  const created = await readJsonResponse(create_response);
  const job_id = readJobId(created);
  if (!job_id) {
    throw new Error("Luchi image job id is missing");
  }
  return job_id;
}

async function readLuchiJob(params: {
  base_url: string;
  api_key: string;
  job_id: string;
}): Promise<unknown> {
  const response = await fetch(`${trimTrailingSlash(params.base_url)}/api/relay/image-jobs/${encodeURIComponent(params.job_id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.api_key}`,
    },
  });
  return await readJsonResponse(response);
}

function createLuchiEditFormData(
  body: Record<string, unknown>,
  reference_images: Array<{ url: string; media_type?: string }>,
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }

  for (const [index, image] of reference_images.entries()) {
    const parsed = parseDataUrl(image.url);
    if (!parsed) {
      throw new Error("Luchi edits currently require reference images as data_url");
    }
    const media_type = image.media_type || parsed.media_type;
    const bytes = base64ToBytes(parsed.data);
    form.append("image", new Blob([toArrayBuffer(bytes)], { type: media_type }), `reference-${index + 1}.${extensionFromMediaType(media_type)}`);
  }
  return form;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readJobId(data: unknown): string {
  const record = toRecord(data);
  const nested = toRecord(record?.data) ?? toRecord(record?.job);
  return readString(record?.id) ||
    readString(record?.job_id) ||
    readString(nested?.id) ||
    readString(nested?.job_id);
}

function readJobStatus(data: unknown): string {
  const record = toRecord(data);
  const nested = toRecord(record?.data) ?? toRecord(record?.job);
  return (readString(record?.status) || readString(nested?.status)).toLowerCase();
}

// ===========================================================================
// Data URL 工具
// ===========================================================================

function parseDataUrl(value: string): { media_type: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value);
  if (!match) return null;
  return {
    media_type: match[1] || DEFAULT_IMAGE_MEDIA_TYPE,
    data: match[2] || "",
  };
}

function toDataUrl(media_type: string, base64: string): string {
  return `data:${media_type};base64,${base64}`;
}

function extensionFromMediaType(media_type: string): string {
  const normalized = media_type.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "png";
}
