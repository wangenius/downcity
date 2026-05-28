/**
 * ASR plugin 配置读写工具。
 *
 * 关键点（中文）
 * - 行为配置与转写依赖配置统一收敛到 `plugins.asr`。
 * - 写入前将输入规范化为 JSON object，避免 undefined 进入项目配置。
 */

import type { VoicePluginConfig } from "@/builtins/voice/types/VoicePlugin.js";
import type { AgentPluginConfigRuntime } from "@downcity/agent/internal/types/runtime/host/AgentHost.js";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";

/**
 * 将普通对象转为可持久化 JSON object。
 */
export function toJsonObject(
  input: Record<string, unknown> | null | undefined,
): JsonObject | null {
  if (!input) return null;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .filter((item) => item !== undefined)
        .map((item) => item as JsonValue);
      continue;
    }
    if (typeof value === "object") {
      out[key] = toJsonObject(value as Record<string, unknown>) || {};
    }
  }
  return out;
}

/**
 * 读取字符串选项。
 */
export function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * 读取布尔选项。
 */
export function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = opts[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

/**
 * 读取 ASR Plugin 配置。
 */
export function readVoicePluginConfig(runtime: {
  config: {
    plugins?: Record<string, unknown>;
  };
}): VoicePluginConfig {
  const current = runtime.config.plugins?.asr;
  const normalized =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as VoicePluginConfig)
      : {};
  return {
    injectPrompt:
      typeof normalized.injectPrompt === "boolean"
        ? normalized.injectPrompt
        : true,
    augmentMessage:
      typeof normalized.augmentMessage === "boolean"
        ? normalized.augmentMessage
        : true,
    provider:
      normalized.provider === "command" || normalized.provider === "local"
        ? normalized.provider
        : "local",
    ...(typeof normalized.modelId === "string" ? { modelId: normalized.modelId } : {}),
    ...(typeof normalized.modelsDir === "string" ? { modelsDir: normalized.modelsDir } : {}),
    ...(typeof normalized.pythonBin === "string" ? { pythonBin: normalized.pythonBin } : {}),
    ...(typeof normalized.command === "string" ? { command: normalized.command } : {}),
    ...(typeof normalized.language === "string" ? { language: normalized.language } : {}),
    ...(typeof normalized.timeoutMs === "number" ? { timeoutMs: normalized.timeoutMs } : {}),
    ...(typeof normalized.strategy === "string" ? { strategy: normalized.strategy } : {}),
    ...(Array.isArray(normalized.installedModels)
      ? { installedModels: normalized.installedModels }
      : {}),
  };
}

/**
 * 写入完整 ASR plugin 配置。
 */
export async function writeVoicePluginConfig(params: {
  agentState: {
    config: {
      plugins?: Record<string, unknown>;
    };
    pluginConfig: AgentPluginConfigRuntime;
  };
  value: VoicePluginConfig;
}): Promise<void> {
  if (!params.agentState.config.plugins) {
    params.agentState.config.plugins = {};
  }
  const next: Record<string, unknown> = {
    ...(params.value as Record<string, unknown>),
  };
  delete next.enabled;
  params.agentState.config.plugins.asr = (toJsonObject(next) || {}) as JsonObject;
  await params.agentState.pluginConfig.persistProjectPlugins(
    params.agentState.config.plugins as Record<string, JsonObject>,
  );
}
