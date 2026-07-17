/**
 * AI Service 调用器（对应 service/ai/ai-service.ts AIService）。
 *
 * 路由：/v1/ai/{modality} 和 /v1/ai/models。
 */

import { parseAIStreamBody } from "./stream.js";
import {
  type CityModelDescriptor,
} from "@downcity/type";
import { CityModel } from "./CityModel.js";
import type { UserModelRef } from "./types.js";
import type { CityLanguageModelStreamRequestV1 } from "../../../types/CityLanguageModelTransport.js";
import type {
  UserImageInput,
  UserImageJobCreateResult,
  UserImageJobResult,
  UserImageJobResultInput,
  UserAsrInput,
  UserAsrResult,
  UserServiceInput,
  UserStreamResult,
  UserTextResult,
  UserTtsInput,
  UserTtsResult,
  UserVideoResult,
} from "../../user/types.js";
import type { FetchResponseLike, RequestInitLike } from "../../http.js";

const PREFIX = "/v1/ai";

/**
 * AI 服务调用器。
 *
 * 通过 User City .ai 访问：
 * ```ts
 * await client.ai.text({ model: "deepseek-v4-flash", prompt: "hello" });
 * const catalog = await client.ai.listModels();
 * ```
 */
export class AIInvoker {
  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;
  private readonly reqRaw: (path: string, init: RequestInitLike) => Promise<FetchResponseLike>;
  private readonly input: (input: UserServiceInput) => Record<string, unknown>;
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(opts: {
    baseUrl: string;
    token?: string;
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
    requestRaw: (path: string, init: RequestInitLike) => Promise<FetchResponseLike>;
    buildInput: (input: UserServiceInput) => Record<string, unknown>;
  }) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.req = opts.requestJSON;
    this.reqRaw = opts.requestRaw;
    this.input = opts.buildInput;
  }

  /**
   * OpenAI-compatible endpoint 根地址。
   *
   * 关键点（中文）
   * - SDK 只暴露稳定 HTTP endpoint，不绑定任何第三方 provider。
   * - 产品侧可以把该地址传给 OpenAI SDK 或 AI SDK provider 的 `baseURL`。
   */
  get base_url(): string {
    return `${this.baseUrl}/v1/ai`;
  }

  /** 文本生成。支持 tools 参数（ai-sdk tool 格式，自动序列化去掉 execute） */
  text(input: UserServiceInput): Promise<UserTextResult> {
    return this.req<UserTextResult>(`${PREFIX}/text`, {
      method: "POST",
      body: JSON.stringify(this.input(this.serializeTools(input))),
    });
  }

  /** 流式生成。支持 tools 参数（ai-sdk tool 格式，自动序列化去掉 execute） */
  async stream(input: UserServiceInput): Promise<UserStreamResult> {
    const res = await this.reqRaw(`${PREFIX}/stream`, {
      method: "POST",
      body: JSON.stringify(this.input(this.serializeTools(input))),
    });
    return parseAIStreamBody(res.body);
  }

  /** 使用当前 City user 鉴权上下文调用原生 LanguageModel endpoint。 */
  language_model_stream(
    request: CityLanguageModelStreamRequestV1,
    signal?: AbortSignal,
  ): Promise<FetchResponseLike> {
    return this.reqRaw(`${PREFIX}/language-model/stream`, {
      method: "POST",
      body: JSON.stringify(request),
      signal,
    });
  }

  /** 创建图片生成任务 */
  image_create(input: UserImageInput): Promise<UserImageJobCreateResult> {
    return this.post<UserImageJobCreateResult>("/image/create", input);
  }

  /** 查询图片生成任务 */
  image_result(input: UserImageJobResultInput): Promise<UserImageJobResult> {
    return this.post<UserImageJobResult>("/image/result", input as unknown as UserServiceInput);
  }

  /** 视频生成 */
  video(input: UserServiceInput): Promise<UserVideoResult> {
    return this.post<UserVideoResult>("/video", input);
  }

  /** 语音合成 */
  tts(input: UserTtsInput): Promise<UserTtsResult> {
    return this.post<UserTtsResult>("/tts", input);
  }

  /** 语音识别 */
  asr(input: UserAsrInput): Promise<UserAsrResult> {
    return this.post<UserAsrResult>("/asr", input);
  }

  /** 获取模型目录 */
  async listModels(): Promise<ModelCatalog> {
    const body = await this.req<{ items: CityModelDescriptor[] }>(`${PREFIX}/models`, { method: "GET" });
    return new ModelCatalog(body.items, this);
  }

  /**
   * 获取指定模型的操作句柄。
   *
   * ```ts
   * const ref = catalog.get("kimi-k2.6");
   * const m = client.ai.model(ref);
   * // 便捷调用
   * const msg = await m.text({ messages: [...] });
   * // 或自己接第三方 SDK
   * const openai = new OpenAI({ baseURL: m.url(), apiKey: m.token });
   * ```
   */
  model(ref: UserModelRef | string): ModelHandle {
    if (typeof ref === "string") {
      return new ModelHandle(this, ref, ref, this.base_url, this.token);
    }
    return new ModelHandle(this, ref.id, ref.name, this.base_url, this.token, ref.meta);
  }

  private post<T>(path: string, input: UserServiceInput): Promise<T> {
    return this.req<T>(`${PREFIX}${path}`, {
      method: "POST",
      body: JSON.stringify(this.input(input)),
    });
  }

  /**
   * 解析 AI SDK / OpenAI function tool 的名称。
   */
  private resolveToolName(name: unknown, def: unknown): string {
    const direct_name = typeof name === "string" ? name.trim() : "";
    if (direct_name) return direct_name;
    if (!def || typeof def !== "object") return "";
    const record = def as {
      name?: unknown;
      function?: { name?: unknown };
    };
    const provider_name =
      typeof record.name === "string" ? record.name.trim() : "";
    if (provider_name) return provider_name;
    return typeof record.function?.name === "string"
      ? record.function.name.trim()
      : "";
  }

  /**
   * 解析 AI SDK v6 provider tool / OpenAI function tool 的参数 schema。
   */
  private resolveToolParameters(def: unknown): unknown {
    if (!def || typeof def !== "object") return {};
    const record = def as {
      parameters?: unknown;
      inputSchema?: unknown;
      function?: { parameters?: unknown };
    };
    const input_schema = record.inputSchema as
      | { jsonSchema?: unknown }
      | undefined;
    return (
      record.function?.parameters ??
      record.parameters ??
      input_schema?.jsonSchema ??
      record.inputSchema ??
      {}
    );
  }

  /**
   * 将 ai-sdk tool 格式序列化为 OpenAI function 格式（去掉 execute，只保留 schema）。
   */
  private serializeToolDefinition(
    name: unknown,
    def: unknown,
  ): Record<string, unknown> | null {
    const tool_name = this.resolveToolName(name, def);
    if (!tool_name) return null;
    const record = def && typeof def === "object"
      ? (def as {
          description?: unknown;
          function?: { description?: unknown };
        })
      : {};
    return {
      type: "function",
      function: {
        name: tool_name,
        description:
          typeof record.function?.description === "string"
            ? record.function.description
            : typeof record.description === "string"
              ? record.description
              : "",
        parameters: this.resolveToolParameters(def),
      },
    };
  }

  /** 将 ai-sdk tool 格式序列化为 OpenAI function 格式（去掉 execute，只保留 schema） */
  private serializeTools(input: UserServiceInput): UserServiceInput {
    const { tools, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (Array.isArray(tools)) {
      // 关键点（中文）：AI SDK v6 传给自定义 provider 的 tools 是
      // `{ type, name, inputSchema }`，City server 需要 OpenAI function 形态。
      body.tools = tools
        .map((def) => this.serializeToolDefinition(undefined, def))
        .filter((def): def is Record<string, unknown> => def !== null);
      return body as UserServiceInput;
    }
    if (tools && typeof tools === "object") {
      body.tools = Object.entries(tools as Record<string, unknown>)
        .map(([name, def]) => this.serializeToolDefinition(name, def))
        .filter((def): def is Record<string, unknown> => def !== null);
    }
    return body as UserServiceInput;
  }
}

// ===================================================================
// ModelCatalog
// ===================================================================

/**
 * 模型目录（AIInvoker.listModels() 返回值）。
 */
export class ModelCatalog {
  private readonly byId: Map<string, UserModelRef>;

  constructor(items: CityModelDescriptor[], ai: AIInvoker) {
    if (!items?.length) {
      this.byId = new Map();
      return;
    }

    const enriched = items.map((item) => new CityModel({
      descriptor: item,
      request_stream: (request, signal) => ai.language_model_stream(request, signal),
    }));

    this.byId = new Map(enriched.map((item) => [item.id, item]));
  }

  get(id: string): UserModelRef | undefined {
    return this.byId.get(String(id ?? "").trim());
  }

  all(): UserModelRef[] {
    return [...this.byId.values()];
  }

  forModality(modality: string): UserModelRef[] {
    const m = String(modality ?? "").trim();
    return [...this.byId.values()].filter((item) => item.modalities.includes(m));
  }
}

/** 将 UserModelInput 转为字符串 */
export function serializeModel(model: import("./types.js").UserModelInput | undefined): string | undefined {
  if (!model) return undefined;
  return typeof model === "string" ? model : model.id;
}

// ===================================================================
// ModelHandle — 绑定模型 ID 的操作句柄
// ===================================================================

/**
 * 模型操作句柄。
 *
 * 两种使用方式：
 * 1. 便捷调用：m.text() / m.stream() — 走 server
 * 2. 接入其他 SDK：m.url() + m.modelName() + m.token — 自己拼
 *
 * 通过 `client.ai.model(ref)` 获取，ref 来自 `listModels()`。
 */
export class ModelHandle {
  /** 模型元数据（来自 server 的 PublicModel.meta） */
  readonly meta: Record<string, unknown>;
  /** Server AI 端点 */
  readonly endpoint: string;
  /** User auth token */
  readonly token: string | undefined;

  constructor(
    private readonly ai: AIInvoker,
    /** 模型 ID */
    readonly id: string,
    /** 模型展示名称 */
    readonly name: string = id,
    /** Server AI 端点 */
    endpoint: string = "",
    /** User auth token */
    token?: string,
    meta?: Record<string, unknown>,
  ) {
    this.endpoint = endpoint;
    this.token = token;
    this.meta = meta ?? {};
  }

  // ======== 便捷调用（走 server） ========

  /** 流式生成 */
  stream(input: Omit<UserServiceInput, "model">): Promise<UserStreamResult> {
    return this.ai.stream({ ...input, model: this.id });
  }

  /** 文本生成 */
  text(input: Omit<UserServiceInput, "model">): Promise<UserTextResult> {
    return this.ai.text({ ...input, model: this.id });
  }

  /** 视频生成 */
  video(input: Omit<UserServiceInput, "model">): Promise<UserVideoResult> {
    return this.ai.video({ ...input, model: this.id });
  }

  // ======== 接入其他 SDK 的零配件 ========

  /** Server AI 端点 URL */
  url(): string {
    return this.endpoint;
  }

  /** 模型名称（API 调用时的 model 参数值） */
  modelName(): string {
    return this.id;
  }
}
