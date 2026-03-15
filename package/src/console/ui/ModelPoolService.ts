/**
 * Console UI 模型池服务。
 *
 * 关键点（中文）
 * - 封装 provider/model 的增删改查与测试逻辑，供 UI 网关复用。
 * - 与 CLI `sma console model` 保持同一数据源（ConsoleStore）。
 * - Provider 的密钥仅返回脱敏视图，避免在 UI 接口中泄露明文。
 */

import { generateText } from "ai";
import type { LlmProviderType } from "@agent/types/LlmConfig.js";
import { ConsoleStore } from "@/utils/store/index.js";
import { createModel } from "@/console/model/CreateModel.js";
import { discoverProviderModels } from "@/console/commands/ModelSupport.js";

const SUPPORTED_PROVIDER_TYPES: readonly LlmProviderType[] = [
  "anthropic",
  "openai",
  "deepseek",
  "gemini",
  "open-compatible",
  "open-responses",
  "moonshot",
  "xai",
  "huggingface",
  "openrouter",
];

function maskSecret(value: string | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function assertProviderType(inputType: string): LlmProviderType {
  const candidate = String(inputType || "").trim() as LlmProviderType;
  if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
    throw new Error(
      `Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return candidate;
}

function parseOptionalNumber(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const num = Number(input);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`Invalid number: ${String(input)}`);
  }
  return num;
}

function parseOptionalPositiveInteger(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const num = Number.parseInt(String(input), 10);
  if (!Number.isFinite(num) || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid positive integer: ${String(input)}`);
  }
  return num;
}

/**
 * ModelPoolService：提供 UI 可调用的模型池管理能力。
 */
export class ModelPoolService {
  /**
   * 读取模型池快照。
   */
  async listPool(): Promise<{
    providers: Array<{
      id: string;
      type: string;
      baseUrl?: string;
      hasApiKey: boolean;
      apiKeyMasked?: string;
      createdAt: string;
      updatedAt: string;
    }>;
    models: Array<{
      id: string;
      providerId: string;
      name: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      anthropicVersion?: string;
      isPaused: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    providerIds: string[];
    modelIds: string[];
  }> {
    const store = new ConsoleStore();
    try {
      const providersRaw = await store.listProviders();
      const models = store.listModels();
      const providers = providersRaw.map((item) => ({
        id: item.id,
        type: item.type,
        baseUrl: item.baseUrl,
        hasApiKey: String(item.apiKey || "").trim().length > 0,
        apiKeyMasked: maskSecret(item.apiKey),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
      return {
        providers,
        models,
        providerIds: providers.map((x) => x.id),
        modelIds: models.map((x) => x.id),
      };
    } finally {
      store.close();
    }
  }

  /**
   * 新增或更新 provider。
   */
  async upsertProvider(input: {
    id: string;
    type: string;
    baseUrl?: string;
    apiKey?: string;
    clearBaseUrl?: boolean;
    clearApiKey?: boolean;
  }): Promise<{
    providerId: string;
    provider: {
      id: string;
      type: string;
      baseUrl?: string;
      hasApiKey: boolean;
      apiKeyMasked?: string;
    };
  }> {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("providerId cannot be empty");
    const type = assertProviderType(input.type);
    if (input.baseUrl !== undefined && input.clearBaseUrl === true) {
      throw new Error("baseUrl and clearBaseUrl cannot be used together");
    }
    if (input.apiKey !== undefined && input.clearApiKey === true) {
      throw new Error("apiKey and clearApiKey cannot be used together");
    }

    const store = new ConsoleStore();
    try {
      const current = await store.getProvider(id);
      const nextBaseUrl = input.clearBaseUrl === true
        ? undefined
        : input.baseUrl !== undefined
          ? String(input.baseUrl || "").trim() || undefined
          : current?.baseUrl;
      const nextApiKey = input.clearApiKey === true
        ? undefined
        : input.apiKey !== undefined
          ? String(input.apiKey || "")
          : current?.apiKey;

      await store.upsertProvider({
        id,
        type,
        baseUrl: nextBaseUrl,
        apiKey: nextApiKey,
      });

      const saved = await store.getProvider(id);
      return {
        providerId: id,
        provider: {
          id,
          type,
          baseUrl: saved?.baseUrl,
          hasApiKey: String(saved?.apiKey || "").trim().length > 0,
          apiKeyMasked: maskSecret(saved?.apiKey),
        },
      };
    } finally {
      store.close();
    }
  }

  /**
   * 删除 provider。
   */
  async removeProvider(providerId: string): Promise<void> {
    const id = String(providerId || "").trim();
    if (!id) throw new Error("providerId cannot be empty");
    const store = new ConsoleStore();
    try {
      store.removeProvider(id);
    } finally {
      store.close();
    }
  }

  /**
   * 测试 provider 并返回发现结果。
   */
  async testProvider(providerId: string): Promise<{
    providerId: string;
    discoveredModels: string[];
    modelCount: number;
    status?: number;
  }> {
    const id = String(providerId || "").trim();
    if (!id) throw new Error("providerId cannot be empty");
    const store = new ConsoleStore();
    try {
      const provider = await store.getProvider(id);
      if (!provider) throw new Error(`Provider not found: ${id}`);
      const discovery = await discoverProviderModels({
        providerId: id,
        providerType: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      });
      if (!discovery.ok) {
        throw new Error(discovery.error || `provider test failed (${discovery.status || "n/a"})`);
      }
      return {
        providerId: id,
        discoveredModels: discovery.models,
        modelCount: discovery.models.length,
        status: discovery.status,
      };
    } finally {
      store.close();
    }
  }

  /**
   * 发现 provider 模型并可选自动写入模型池。
   */
  async discoverProvider(params: {
    providerId: string;
    autoAdd?: boolean;
    prefix?: string;
  }): Promise<{
    providerId: string;
    discoveredModels: string[];
    modelCount: number;
    autoAdded: Array<{ modelId: string; modelName: string }>;
  }> {
    const providerId = String(params.providerId || "").trim();
    if (!providerId) throw new Error("providerId cannot be empty");
    const store = new ConsoleStore();
    try {
      const provider = await store.getProvider(providerId);
      if (!provider) throw new Error(`Provider not found: ${providerId}`);
      const discovery = await discoverProviderModels({
        providerId,
        providerType: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      });
      if (!discovery.ok) {
        throw new Error(discovery.error || `provider discover failed (${discovery.status || "n/a"})`);
      }

      const autoAdded: Array<{ modelId: string; modelName: string }> = [];
      if (params.autoAdd === true) {
        const prefix = String(params.prefix || "").trim();
        for (const remoteModelName of discovery.models) {
          const modelName = String(remoteModelName || "").trim();
          if (!modelName) continue;
          const modelId = prefix ? `${prefix}${modelName}` : modelName;
          if (store.getModel(modelId)) continue;
          store.upsertModel({
            id: modelId,
            providerId,
            name: modelName,
          });
          autoAdded.push({ modelId, modelName });
        }
      }

      return {
        providerId,
        discoveredModels: discovery.models,
        modelCount: discovery.models.length,
        autoAdded,
      };
    } finally {
      store.close();
    }
  }

  /**
   * 新增或更新 model。
   */
  async upsertModel(input: {
    id: string;
    providerId: string;
    name: string;
    temperature?: unknown;
    maxTokens?: unknown;
    topP?: unknown;
    frequencyPenalty?: unknown;
    presencePenalty?: unknown;
    anthropicVersion?: string;
    isPaused?: boolean;
  }): Promise<{ modelId: string }> {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const providerId = String(input.providerId || "").trim();
    if (!providerId) throw new Error("providerId cannot be empty");
    const name = String(input.name || "").trim();
    if (!name) throw new Error("modelName cannot be empty");

    const store = new ConsoleStore();
    try {
      store.upsertModel({
        id,
        providerId,
        name,
        temperature: parseOptionalNumber(input.temperature),
        maxTokens: parseOptionalPositiveInteger(input.maxTokens),
        topP: parseOptionalNumber(input.topP),
        frequencyPenalty: parseOptionalNumber(input.frequencyPenalty),
        presencePenalty: parseOptionalNumber(input.presencePenalty),
        anthropicVersion: String(input.anthropicVersion || "").trim() || undefined,
        isPaused: input.isPaused === true,
      });
      return { modelId: id };
    } finally {
      store.close();
    }
  }

  /**
   * 删除 model。
   */
  async removeModel(modelId: string): Promise<void> {
    const id = String(modelId || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const store = new ConsoleStore();
    try {
      store.removeModel(id);
    } finally {
      store.close();
    }
  }

  /**
   * 设置 model pause 状态。
   */
  async setModelPaused(modelId: string, isPaused: boolean): Promise<void> {
    const id = String(modelId || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const store = new ConsoleStore();
    try {
      store.setModelPaused(id, isPaused);
    } finally {
      store.close();
    }
  }

  /**
   * 测试 model 可调用性（真实推理调用）。
   */
  async testModel(modelId: string, prompt?: string): Promise<{
    modelId: string;
    prompt: string;
    text: string;
  }> {
    const id = String(modelId || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const actualPrompt = String(prompt || "").trim() || "Reply with exactly: OK";
    const model = await createModel({
      config: {
        name: "console-model-test",
        version: "1.0.0",
        model: { primary: id },
      },
    });
    const result = await generateText({
      model,
      prompt: actualPrompt,
    });
    return {
      modelId: id,
      prompt: actualPrompt,
      text: result.text,
    };
  }
}

