/**
 * `city model` 命令共享工具。
 *
 * 关键点（中文）
 * - 统一封装 provider / model 子命令共用的解析、脱敏、错误输出逻辑。
 * - 保持 `Model.ts` 只负责命令装配，不再承载具体业务实现。
 */

import { printResult } from "@shared/utils/cli/CliOutput.js";
import { ModelManager, type ModelPreset } from "@/main/city/model/ModelManager.js";
import type { LlmProviderType } from "@/shared/types/LlmConfig.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";

const SUPPORTED_PROVIDER_TYPES: readonly LlmProviderType[] = [
  "anthropic",
  "openai",
  "deepseek",
  "gemini",
  "open-compatible",
  "open-responses",
  "moonshot-cn",
  "moonshot-ai",
  "kimi-code",
  "xai",
  "huggingface",
  "openrouter",
];

const modelManager = new ModelManager();

function maskSecret(value: string | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

export function toSafeProviderView<T extends { apiKey?: string }>(provider: T): T & {
  apiKeyMasked?: string;
} {
  const masked = maskSecret(provider.apiKey);
  return {
    ...provider,
    apiKey: masked ? "***masked***" : undefined,
    apiKeyMasked: masked,
  };
}

export function parseBooleanOption(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

export function parseNumberOption(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return num;
}

export function parsePositiveIntegerOption(value: string): number {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return num;
}

export function assertProviderType(inputType: string): LlmProviderType {
  const candidate = String(inputType || "").trim() as LlmProviderType;
  if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
    throw new Error(
      `Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return candidate;
}

export function getSupportedProviderTypes(): readonly LlmProviderType[] {
  return SUPPORTED_PROVIDER_TYPES;
}

export function resolveModelPresetOrThrow(input?: string): ModelPreset | undefined {
  const presetId = String(input || "").trim();
  if (!presetId) return undefined;
  const preset = modelManager.getPreset(presetId);
  if (!preset) throw new Error(`Unknown model preset: ${presetId}`);
  return preset;
}

export async function runStoreCommand(
  options: { json?: boolean },
  handler: (store: ConsoleStore) => Promise<{
    title: string;
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  const asJson = options.json !== false;
  let store: ConsoleStore | null = null;
  try {
    store = new ConsoleStore();
    const result = await handler(store);
    printResult({
      asJson,
      success: true,
      title: result.title,
      payload: result.payload,
    });
  } catch (error) {
    printResult({
      asJson,
      success: false,
      title: "console model command failed",
      payload: {
        error:
          error instanceof Error &&
          String(error.message || "").includes("unable to open database file")
            ? 'Console model store is unavailable. Run "city init" first.'
            : error instanceof Error
              ? error.message
              : String(error),
      },
    });
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
