/**
 * `console model` 支撑工具。
 *
 * 关键点（中文）
 * - 收敛“路径处理、provider 模型发现、项目 model 绑定写入”等可复用逻辑。
 * - 让命令编排文件保持在可维护规模内。
 */

import fs from "fs-extra";
import path from "node:path";
import type { LlmProviderType } from "@/types/LlmConfig.js";
import { getDowncityJsonPath } from "@/main/env/Paths.js";
import type { DowncityConfig } from "@/types/DowncityConfig.js";

const OPENAI_COMPAT_PROVIDER_TYPES = new Set<LlmProviderType>([
  "openai",
  "deepseek",
  "moonshot-cn",
  "moonshot-ai",
  "kimi-code",
  "xai",
  "huggingface",
  "openrouter",
  "open-compatible",
  "open-responses",
]);

export type ProviderDiscoveryResult = {
  providerId: string;
  providerType: LlmProviderType;
  ok: boolean;
  status?: number;
  models: string[];
  error?: string;
};

export function resolveEnvPlaceholder(value: string | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const matched = raw.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!matched) return raw;
  return process.env[matched[1]];
}

export function resolveProviderDefaultBaseUrl(
  providerType: LlmProviderType,
): string | undefined {
  if (providerType === "deepseek") return "https://api.deepseek.com/v1";
  if (providerType === "moonshot-cn") return "https://api.moonshot.cn/v1";
  if (providerType === "moonshot-ai") return "https://api.moonshot.ai/v1";
  if (providerType === "kimi-code") return "https://api.kimi.com/coding/v1";
  if (providerType === "xai") return "https://api.x.ai/v1";
  if (providerType === "openrouter") return "https://openrouter.ai/api/v1";
  if (providerType === "open-compatible") return "https://api.openai.com/v1";
  if (providerType === "open-responses") return "https://api.openai.com/v1";
  return undefined;
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw || undefined;
}

export function extractModelIdsFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: unknown; name?: unknown }).id || "").trim();
    if (id) {
      ids.push(id);
      continue;
    }
    const name = String((item as { name?: unknown }).name || "").trim();
    if (name) ids.push(name);
  }
  return [...new Set(ids)];
}

export async function discoverProviderModels(params: {
  providerId: string;
  providerType: LlmProviderType;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderDiscoveryResult> {
  const providerId = String(params.providerId || "").trim();
  const providerType = params.providerType;
  const baseUrl = normalizeBaseUrl(params.baseUrl) || resolveProviderDefaultBaseUrl(providerType);
  const apiKey = resolveEnvPlaceholder(params.apiKey);
  if (!apiKey) {
    return {
      providerId,
      providerType,
      ok: false,
      models: [],
      error: "Missing apiKey (or unresolved ${ENV_VAR})",
    };
  }

  try {
    if (providerType === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, { method: "GET" });
      const payload = (await response.json().catch(() => ({}))) as {
        models?: Array<{ name?: unknown }>;
      };
      const models = Array.isArray(payload.models)
        ? payload.models
            .map((x) => String(x?.name || "").trim())
            .filter(Boolean)
            .map((x) => x.replace(/^models\//, ""))
        : [];
      return {
        providerId,
        providerType,
        ok: response.ok,
        status: response.status,
        models: [...new Set(models)],
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    }

    if (providerType === "anthropic") {
      const url = "https://api.anthropic.com/v1/models";
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      const models = extractModelIdsFromPayload(payload);
      return {
        providerId,
        providerType,
        ok: response.ok,
        status: response.status,
        models,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    }

    if (OPENAI_COMPAT_PROVIDER_TYPES.has(providerType)) {
      const endpointBase = baseUrl || "https://api.openai.com/v1";
      const response = await fetch(`${endpointBase}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      const models = extractModelIdsFromPayload(payload);
      return {
        providerId,
        providerType,
        ok: response.ok,
        status: response.status,
        models,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    }

    return {
      providerId,
      providerType,
      ok: false,
      models: [],
      error: `Model discovery is not implemented for provider type: ${providerType}`,
    };
  } catch (error) {
    return {
      providerId,
      providerType,
      ok: false,
      models: [],
      error: String(error),
    };
  }
}

export function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

/**
 * 设置项目 `downcity.json.execution.modelId`。
 *
 * 关键点（中文）
 * - 仅更新绑定字段，不触碰其他运行配置。
 * - 该操作用于把“模型池中的模型 ID”绑定到具体 agent 项目。
 */
export function setProjectPrimaryModel(projectRoot: string, modelId: string): {
  shipJsonPath: string;
  previousPrimary: string;
  nextPrimary: string;
} {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    throw new Error(`downcity.json not found at ${shipJsonPath}`);
  }
  const raw = fs.readJsonSync(shipJsonPath) as Partial<DowncityConfig>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid downcity.json: expected object (${shipJsonPath})`);
  }
  const previousPrimary =
    String(raw.execution?.type === "model" ? raw.execution.modelId || "" : "").trim();
  const nextPrimary = String(modelId || "").trim();
  if (!nextPrimary) throw new Error("modelId cannot be empty");
  const nextConfig: DowncityConfig = {
    ...(raw as DowncityConfig),
    execution: {
      type: "model",
      modelId: nextPrimary,
    },
  };
  fs.writeJsonSync(shipJsonPath, nextConfig, { spaces: 2 });
  return {
    shipJsonPath,
    previousPrimary,
    nextPrimary,
  };
}
