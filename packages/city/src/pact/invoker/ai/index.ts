/**
 * AI Service 调用器（对应 service/ai/ai-service.ts AIService）。
 *
 * 路由：/v1/ai/{modality} 和 /v1/ai/models。
 */

import { parseAIStreamBody } from "./stream.js";
import {
  CITY_MODEL_INVOKER,
  CITY_MODEL_KIND,
  type CityModel,
  type CityModelConnection,
  type CityModelDescriptor,
} from "@downcity/type";
import type { UserModelRef } from "./types.js";
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
import type { RequestInitLike } from "../../http.js";

const PREFIX = "/v1/ai";

/**
 * AI 服务调用器。
 *
 * 通过 User CityPact .ai 访问：
 * ```ts
 * await client.ai.text({ prompt: "hello" });
 * const catalog = await client.ai.listModels();
 * ```
 */
export class AIInvoker {
  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;
  private readonly reqRaw: (path: string, init: RequestInitLike) => Promise<{ body: import("../../http.js").RawStreamBody }>;
  private readonly input: (input: UserServiceInput) => Record<string, unknown>;
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(opts: {
    baseUrl: string;
    token?: string;
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
    requestRaw: (path: string, init: RequestInitLike) => Promise<{ body: import("../../http.js").RawStreamBody }>;
    buildInput: (input: UserServiceInput) => Record<string, unknown>;
  }) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.req = opts.requestJSON;
    this.reqRaw = opts.requestRaw;
    this.input = opts.buildInput;
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

  /**
   * 返回当前模型的 OpenAI-compatible 连接信息。
   *
   * 关键点（中文）
   * - City SDK 只负责提供连接上下文，不负责创建 AI SDK LanguageModel。
   * - Agent SDK 会读取该信息并在 agent 包内完成模型转换。
   */
  connection(modelId: string): CityModelConnection {
    const resolved_model_id = String(modelId || "").trim();
    if (!resolved_model_id) {
      throw new TypeError("modelId is required");
    }
    return {
      base_url: `${this.baseUrl}/v1/ai`,
      api_key: this.token,
      model_id: resolved_model_id,
      request_body: this.input({ model: resolved_model_id } as UserServiceInput),
    };
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
      return new ModelHandle(this, ref, ref, `${this.baseUrl}/v1/ai`, this.token);
    }
    return new ModelHandle(this, ref.id, ref.name, `${this.baseUrl}/v1/ai`, this.token, ref.meta);
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
  private serializeTools(input: UserServiceInput): Record<string, unknown> {
    const { tools, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (Array.isArray(tools)) {
      // 关键点（中文）：AI SDK v6 传给自定义 provider 的 tools 是
      // `{ type, name, inputSchema }`，City server 需要 OpenAI function 形态。
      body.tools = tools
        .map((def) => this.serializeToolDefinition(undefined, def))
        .filter((def): def is Record<string, unknown> => def !== null);
      return body;
    }
    if (tools && typeof tools === "object") {
      body.tools = Object.entries(tools as Record<string, unknown>)
        .map(([name, def]) => this.serializeToolDefinition(name, def))
        .filter((def): def is Record<string, unknown> => def !== null);
    }
    return body;
  }
}

// ===================================================================
// ModelCatalog
// ===================================================================

/**
 * 模型目录（AIInvoker.listModels() 返回值）。
 *
 * 计算规则：
 * - 第一个模型 = 全局默认
 * - 每个 modality 的第一个支持模型 = 该 modality 的默认
 */
export class ModelCatalog {
  private readonly byId: Map<string, UserModelRef>;
  private readonly def: UserModelRef | undefined;

  constructor(items: CityModelDescriptor[], ai: AIInvoker) {
    if (!items?.length) {
      this.byId = new Map();
      this.def = undefined;
      return;
    }

    const first = new Map<string, string>();
    for (const item of items) {
      for (const m of item.modalities) {
        if (!first.has(m)) first.set(m, item.id);
      }
    }

    const enriched = items.map((item, i) =>
      create_city_model(ai, {
        ...item,
        is_default: i === 0,
        default_modalities: item.modalities.filter((m) => first.get(m) === item.id) || undefined,
      }),
    );

    this.byId = new Map(enriched.map((item) => [item.id, item]));
    this.def = enriched[0];
  }

  get(id: string): UserModelRef | undefined {
    return this.byId.get(String(id ?? "").trim());
  }

  default(): UserModelRef | undefined {
    return this.def;
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

function create_city_model(
  ai: AIInvoker,
  item: CityModelDescriptor,
): UserModelRef {
  const model = {
    ...item,
    kind: CITY_MODEL_KIND,
  } as UserModelRef;

  Object.defineProperty(model, CITY_MODEL_INVOKER, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: {
      connection: () => ai.connection(item.id),
    },
  });

  return Object.freeze(model);
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
