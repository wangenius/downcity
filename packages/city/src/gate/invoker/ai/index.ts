/**
 * AI Service 调用器（对应 core service/ai/ai-service.ts AIService）。
 *
 * 路由：/v1/ai/{modality} 和 /v1/ai/models。
 */

import { parseAIStreamBody } from "./stream.js";
import type { UserModelRef } from "./types.js";
import type {
  UserImageResult,
  UserServiceInput,
  UserStreamResult,
  UserTextResult,
  UserVideoResult,
} from "../../user/types.js";
import type { RequestInitLike } from "../../http.js";

const PREFIX = "/v1/ai";

/**
 * AI 服务调用器。
 *
 * 通过 User Gate .ai 访问：
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

  /** 图片生成 */
  image(input: UserServiceInput): Promise<UserImageResult> {
    return this.post<UserImageResult>("/image", input);
  }

  /** 视频生成 */
  video(input: UserServiceInput): Promise<UserVideoResult> {
    return this.post<UserVideoResult>("/video", input);
  }

  /** 语音合成 */
  tts<T = unknown>(input: UserServiceInput): Promise<T> {
    return this.post<T>("/tts", input);
  }

  /** 语音识别 */
  asr<T = unknown>(input: UserServiceInput): Promise<T> {
    return this.post<T>("/asr", input);
  }

  /** 获取模型目录 */
  async listModels(): Promise<ModelCatalog> {
    const body = await this.req<{ items: UserModelRef[] }>(`${PREFIX}/models`, { method: "GET" });
    return new ModelCatalog(body.items);
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

  /** 将 ai-sdk tool 格式序列化为 OpenAI function 格式（去掉 execute，只保留 schema） */
  private serializeTools(input: UserServiceInput): Record<string, unknown> {
    const { tools, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (tools && typeof tools === "object") {
      body.tools = Object.entries(tools as Record<string, unknown>).map(([name, def]) => ({
        type: "function",
        function: {
          name,
          description: (def as { description?: string }).description,
          parameters: (def as { parameters?: unknown }).parameters,
        },
      }));
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

  constructor(items: UserModelRef[]) {
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
      Object.freeze({
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

  /** 图片生成 */
  image(input: Omit<UserServiceInput, "model">): Promise<UserImageResult> {
    return this.ai.image({ ...input, model: this.id });
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
