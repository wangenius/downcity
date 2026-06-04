/**
 * 图片 Provider 构造工具。
 *
 * 关键点（中文）
 * - client.ai.image() 的统一返回协议是 AI SDK UIMessage。
 * - 不同上游的同步响应、Gemini content parts、Luchi 异步 job 都在这里归一成 file parts。
 * - 第一版只支持 JSON / URL / data URL，不处理 multipart 本地文件上传。
 */

import type { FileUIPart, UIMessage } from "ai";
import { Provider, type Context } from "@downcity/city";

/**
 * 图片生成消息内容中的文本片段。
 */
export interface ImageTextContent {
  /** 内容类型。 */
  type: "text";
  /** 文本内容。 */
  text: string;
}

/**
 * 图片生成消息内容中的图片片段。
 */
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

/**
 * 图片生成消息内容片段。
 */
export type ImageContent = ImageTextContent | ImageFileContent;

/**
 * 图片生成上下文消息。
 */
export interface ImageMessage {
  /** 消息角色。 */
  role: "system" | "user" | "assistant";
  /** 消息内容。 */
  content: ImageContent[];
}

/**
 * AIService image action 输入。
 */
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
  /** Provider 私有参数。 */
  provider_options?: Record<string, unknown>;
}

/**
 * OpenAI / 302 images API Provider 配置。
 */
export interface OpenAIImageProviderOptions {
  /** Provider 唯一 ID。 */
  id: string;
  /** API Key 环境变量。 */
  envKey: string;
  /** OpenAI-compatible base URL，通常包含 `/v1`。 */
  baseURL: string;
  /** 默认上游模型 ID。 */
  defaultModelId: string;
  /** 图片生成路径。 */
  generationPath?: string;
  /** provider_options 中读取私有参数的 key，默认 `openai`。 */
  providerOptionsKey?: string;
}

/**
 * Gemini 图片 Provider 配置。
 */
export interface GeminiImageProviderOptions {
  /** Provider 唯一 ID。 */
  id: string;
  /** API Key 环境变量。 */
  envKey: string;
  /** Gemini API base URL。 */
  baseURL?: string;
  /** 默认上游模型 ID。 */
  defaultModelId: string;
}

/**
 * Luchi 图片 Provider 配置。
 */
export interface LuchiImageProviderOptions {
  /** Provider 唯一 ID。 */
  id: string;
  /** access token 环境变量。 */
  envKey: string;
  /** Luchi image API base URL。 */
  baseURL?: string;
  /** 默认上游模型 ID。 */
  defaultModelId: string;
  /** 轮询间隔毫秒。 */
  pollIntervalMs?: number;
  /** 最大轮询次数。 */
  maxPolls?: number;
}

interface ExtractedImage {
  /** 图片 URL 或 data URL。 */
  url: string;
  /** 图片 MIME 类型。 */
  media_type: string;
  /** 文件名。 */
  filename?: string;
}

const DEFAULT_IMAGE_MEDIA_TYPE = "image/png";

/**
 * 创建 OpenAI / 302 images API 图片 Provider。
 */
export function createOpenAIImageProvider(options: OpenAIImageProviderOptions): Provider {
  const provider_options_key = options.providerOptionsKey ?? "openai";
  return new Provider(options.id, {
    env: { [options.envKey]: `${options.id} API Key` },
    image: async (ctx) => {
      const input = normalizeImageActionInput(ctx.input);
      const api_key = readRequiredEnv(ctx, options.envKey);
      const upstream_model = resolveUpstreamModel(ctx, options.defaultModelId);
      const provider_options = readProviderOptions(input, provider_options_key);
      const body = stripUndefined({
        model: upstream_model,
        prompt: extractPrompt(input),
        n: readImageCount(input),
        size: input.size,
        seed: input.seed,
        ...provider_options,
      });

      const response = await fetch(`${trimTrailingSlash(options.baseURL)}${options.generationPath ?? "/images/generations"}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      return buildImageMessage(ctx, extractImagesFromOpenAIResponse(data), {
        provider: options.id,
        provider_options_key,
        upstream_model,
        raw: pickMetadata(data, ["usage", "created"]),
      });
    },
  });
}

/**
 * 创建 Gemini generateContent 图片 Provider。
 */
export function createGeminiImageProvider(options: GeminiImageProviderOptions): Provider {
  const base_url = options.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
  return new Provider(options.id, {
    env: { [options.envKey]: `${options.id} API Key` },
    image: async (ctx) => {
      const input = normalizeImageActionInput(ctx.input);
      const api_key = readRequiredEnv(ctx, options.envKey);
      const upstream_model = resolveUpstreamModel(ctx, options.defaultModelId);
      const provider_options = readProviderOptions(input, "gemini");
      const body = stripUndefined({
        contents: toGeminiContents(input),
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(toRecord(provider_options.generationConfig) ?? {}),
        },
        ...omitKeys(provider_options, ["generationConfig"]),
      });

      const response = await fetch(`${trimTrailingSlash(base_url)}/models/${encodeURIComponent(upstream_model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": api_key,
        },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      return buildImageMessage(ctx, extractImagesFromGeminiResponse(data), {
        provider: options.id,
        upstream_model,
        raw: pickMetadata(data, ["usageMetadata", "promptFeedback"]),
      });
    },
  });
}

/**
 * 创建 Luchi 异步 job 图片 Provider。
 */
export function createLuchiImageProvider(options: LuchiImageProviderOptions): Provider {
  const base_url = options.baseURL ?? "https://image.luchikey.com";
  const poll_interval_ms = options.pollIntervalMs ?? 1000;
  const max_polls = options.maxPolls ?? 60;

  return new Provider(options.id, {
    env: { [options.envKey]: `${options.id} Access Token` },
    image: async (ctx) => {
      const input = normalizeImageActionInput(ctx.input);
      const access_token = readRequiredEnv(ctx, options.envKey);
      const upstream_model = resolveUpstreamModel(ctx, options.defaultModelId);
      const provider_options = readProviderOptions(input, "luchi");
      const reference_images = extractReferenceImages(input);
      const body = stripUndefined({
        model: upstream_model,
        prompt: extractPrompt(input),
        ratio: input.ratio ?? input.aspect_ratio,
        quality: input.quality,
        count: readImageCount(input),
        seed: input.seed,
        client_job_id: input.client_job_id,
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
        ? { "Authorization": `Bearer ${access_token}` }
        : {
            "Authorization": `Bearer ${access_token}`,
            "Content-Type": "application/json",
          };

      const create_response = await fetch(`${trimTrailingSlash(base_url)}${create_path}`, {
        method: "POST",
        headers: create_headers,
        body: create_body,
      });
      const created = await readJsonResponse(create_response);
      const job_id = readJobId(created);
      if (!job_id) {
        throw new Error("Luchi image job id is missing");
      }
      const finished = await pollLuchiJob({
        base_url,
        access_token,
        job_id,
        poll_interval_ms,
        max_polls,
      });

      return buildImageMessage(ctx, extractImagesFromLuchiResponse(finished, base_url), {
        provider: options.id,
        upstream_model,
        job_id,
        raw: pickMetadata(finished, ["status", "usage", "error"]),
      });
    },
  });
}

function normalizeImageActionInput(input: unknown): ImageActionInput {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as ImageActionInput
    : {};
}

function readRequiredEnv(ctx: Context, key: string): string {
  const value = ctx.env(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function resolveUpstreamModel(ctx: Context, fallback: string): string {
  const meta_model = typeof ctx.variant?.meta?.upstream_model === "string"
    ? ctx.variant.meta.upstream_model.trim()
    : "";
  return meta_model || fallback;
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

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const message = readErrorMessage(data) || response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function readErrorMessage(data: unknown): string {
  const record = toRecord(data);
  const nested = toRecord(record?.data) ?? toRecord(record?.job) ?? toRecord(record?.result);
  const error = toRecord(record?.error);
  const nested_error = toRecord(nested?.error);
  const detail = toRecord(error?.detail);
  const nested_detail = toRecord(nested_error?.detail);
  const message =
    readString(error?.message) ||
    readString(detail?.message) ||
    readString(nested_error?.message) ||
    readString(nested_detail?.message) ||
    readString(record?.message) ||
    readString(nested?.message) ||
    readString(record?.error) ||
    readString(nested?.error);
  const code =
    readString(error?.code) ||
    readString(detail?.code) ||
    readString(nested_error?.code) ||
    readString(nested_detail?.code);
  if (!message) return "";
  return code && !message.includes(code) ? `${message} (${code})` : message;
}

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
  const direct_url = readString(record.url) || readString(record.image_url);
  if (direct_url) {
    return {
      url: direct_url,
      media_type,
      filename: readString(record.filename) || fallback_filename,
    };
  }
  const b64 = readString(record.b64_json) || readString(record.base64) || readString(record.data);
  if (!b64) return null;
  return {
    url: b64.startsWith("data:") ? b64 : toDataUrl(media_type, b64),
    media_type,
    filename: readString(record.filename) || fallback_filename,
  };
}

function buildImageMessage(
  ctx: Context,
  images: ExtractedImage[],
  metadata: Record<string, unknown>,
): UIMessage {
  if (images.length === 0) {
    throw new Error("Image provider returned no images");
  }
  const parts: FileUIPart[] = images.map((image) => ({
    type: "file",
    mediaType: image.media_type,
    url: image.url,
    ...(image.filename ? { filename: image.filename } : {}),
  }));

  return {
    id: `msg_${crypto.randomUUID()}`,
    role: "assistant",
    parts,
    metadata: stripUndefined({
      model: ctx.variant?.id,
      town_id: ctx.town?.town_id,
      user_id: ctx.user?.user_id,
      ...metadata,
    }),
  };
}

async function pollLuchiJob(params: {
  base_url: string;
  access_token: string;
  job_id: string;
  poll_interval_ms: number;
  max_polls: number;
}): Promise<unknown> {
  for (let attempt = 0; attempt < params.max_polls; attempt += 1) {
    if (attempt > 0) await sleep(params.poll_interval_ms);
    const response = await fetch(`${trimTrailingSlash(params.base_url)}/api/relay/image-jobs/${encodeURIComponent(params.job_id)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${params.access_token}`,
      },
    });
    const data = await readJsonResponse(response);
    const status = readJobStatus(data);
    if (["succeeded", "success", "completed", "done"].includes(status)) return data;
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(readErrorMessage(data) || `Luchi image job failed: ${status}`);
    }
  }
  throw new Error(`Luchi image job timed out`);
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
  return readString(record?.id) || readString(record?.job_id) || readString(nested?.id) || readString(nested?.job_id);
}

function readJobStatus(data: unknown): string {
  const record = toRecord(data);
  const nested = toRecord(record?.data) ?? toRecord(record?.job);
  return (readString(record?.status) || readString(nested?.status)).toLowerCase();
}

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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function omitKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
}

function pickMetadata(value: unknown, keys: string[]): Record<string, unknown> {
  const record = toRecord(value);
  if (!record) return {};
  return Object.fromEntries(keys.map((key) => [key, record[key]]).filter(([, item]) => item !== undefined));
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
