/**
 * Voice Plugin Dependency Helper。
 *
 * 关键点（中文）
 * - voice 的转写依赖现在内聚在 plugin 内部，不再暴露独立依赖端口心智。
 * - 这里统一管理检查、安装、配置读写与转写句柄解析。
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type {
  VoicePluginConfig,
  VoiceTranscriberConfig,
  VoiceTranscriberInstallInput,
  VoiceTranscriberHandle,
} from "@/types/VoicePlugin.js";
import { transcribeVoiceAudio } from "@/plugins/voice/runtime/Transcriber.js";
import {
  VOICE_MODEL_CATALOG,
  resolveVoiceModelId,
} from "@/plugins/voice/runtime/Catalog.js";
import {
  detectLocalVoiceModelInstallState,
  installVoiceModelFromHuggingFace,
} from "@/plugins/voice/runtime/Installer.js";
import {
  installVoiceTranscribeDependencies,
  resolveVoiceRunnersByModels,
  resolveVoiceStrategyByModel,
} from "@/plugins/voice/runtime/DependencyInstaller.js";
import { resolveVoiceModelsRootDir } from "@/plugins/voice/runtime/Paths.js";
import type { VoiceModelId } from "@/agent/types/Voice.js";
import { persistProjectPluginConfig } from "@/console/plugin/ProjectConfigStore.js";

const execFileAsync = promisify(execFileCb);

export interface VoiceDependencyCheckResult {
  /**
   * 当前依赖是否可用。
   */
  available: boolean;
  /**
   * 不可用原因列表。
   */
  reasons: string[];
  /**
   * 结构化附加数据（可选）。
   */
  details?: JsonValue;
}

export interface VoiceDependencyInstallResult {
  /**
   * 安装是否成功。
   */
  success: boolean;
  /**
   * 人类可读消息（可选）。
   */
  message?: string;
  /**
   * 结构化附加数据（可选）。
   */
  details?: JsonValue;
}

function readVoicePluginRecord(runtime: ExecutionContext): Record<string, unknown> {
  const current = runtime.config.plugins?.voice;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, unknown>;
}

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject {
  const out: JsonObject = {};
  if (!input) return out;
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
      out[key] = toJsonObject(value as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * 读取 voice 转写依赖配置。
 */
export function readVoiceTranscriberConfig(
  runtime: ExecutionContext,
): VoiceTranscriberConfig {
  const current = readVoicePluginRecord(runtime);
  return {
    provider: "local",
    ...(current as VoiceTranscriberConfig),
  };
}

/**
 * 写入 voice 转写依赖配置。
 */
export async function writeVoiceTranscriberConfig(params: {
  runtime: ExecutionContext;
  value: Partial<VoiceTranscriberConfig>;
}): Promise<VoicePluginConfig> {
  if (!params.runtime.config.plugins) {
    params.runtime.config.plugins = {};
  }
  const current = readVoicePluginRecord(params.runtime);
  const next = {
    ...current,
    ...params.value,
  };
  params.runtime.config.plugins.voice = toJsonObject(next);
  await persistProjectPluginConfig({
    projectRoot: params.runtime.rootPath,
    sections: {
      plugins: params.runtime.config.plugins,
    },
  });
  return params.runtime.config.plugins.voice as VoicePluginConfig;
}

async function checkLocalProviderAvailability(
  runtime: ExecutionContext,
  config: VoiceTranscriberConfig,
): Promise<VoiceDependencyCheckResult> {
  const reasons: string[] = [];
  const modelId = resolveVoiceModelId(String(config.modelId || ""));
  if (!modelId) {
    reasons.push("voice transcriber modelId is missing");
    return {
      available: false,
      reasons,
    };
  }

  const modelsRootDir = resolveVoiceModelsRootDir({
    projectRoot: runtime.rootPath,
    modelsDir: config.modelsDir,
  });
  const installState = await detectLocalVoiceModelInstallState({
    modelId,
    modelsRootDir,
  });
  if (!installState.installed) {
    reasons.push(`voice model is not installed: ${modelId}`);
  }

  const pythonBin = String(config.pythonBin || "").trim() || "python3";
  try {
    await execFileAsync(pythonBin, ["--version"], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    reasons.push(`python runtime missing: ${String(error)}`);
  }

  return {
    available: reasons.length === 0,
    reasons,
  };
}

/**
 * 检查 voice 转写依赖可用性。
 */
export async function checkVoiceTranscriber(
  runtime: ExecutionContext,
): Promise<VoiceDependencyCheckResult> {
  const config = readVoiceTranscriberConfig(runtime);
  if (config.provider === "command") {
    const command = String(config.command || "").trim();
    return {
      available: Boolean(command),
      reasons: command ? [] : ["voice transcriber command is missing"],
    };
  }
  return checkLocalProviderAvailability(runtime, config);
}

/**
 * 安装或修复 voice 转写依赖。
 */
export async function installVoiceTranscriber(params: {
  runtime: ExecutionContext;
  input?: VoiceTranscriberInstallInput;
}): Promise<VoiceDependencyInstallResult> {
  const runtime = params.runtime;
  const input = params.input;
  const config = readVoiceTranscriberConfig(runtime);
  if (config.provider === "command") {
    return {
      success: true,
      message: "voice command provider does not require install",
    };
  }

  const requestedModelIds =
    (Array.isArray(input?.modelIds) ? input?.modelIds : [])
      .map((item) => resolveVoiceModelId(String(item || "").trim()))
      .filter((item): item is VoiceModelId => Boolean(item));
  const selectedModelIds: VoiceModelId[] =
    requestedModelIds.length > 0
      ? requestedModelIds
      : [resolveVoiceModelId(String(config.modelId || "SenseVoiceSmall")) || "SenseVoiceSmall"];

  const modelsRootDir = resolveVoiceModelsRootDir({
    projectRoot: runtime.rootPath,
    modelsDir: input?.modelsDir || config.modelsDir,
  });

  for (const modelId of selectedModelIds) {
    const model = VOICE_MODEL_CATALOG.find((item) => item.id === modelId);
    if (!model) {
      throw new Error(`Unsupported voice model: ${modelId}`);
    }
    await installVoiceModelFromHuggingFace({
      model,
      modelsRootDir,
      force: input?.force === true,
      hfToken: input?.hfToken,
    });
  }

  if (input?.installDeps !== false) {
    await installVoiceTranscribeDependencies({
      pythonBin:
        String(input?.pythonBin || config.pythonBin || "").trim() || "python3",
      runners: resolveVoiceRunnersByModels(selectedModelIds),
    });
  }

  const activeModelId =
    resolveVoiceModelId(String(input?.activeModel || "")) ||
    selectedModelIds[0];

  const nextConfig: VoiceTranscriberConfig = {
    ...config,
    provider: "local",
    modelId: activeModelId,
    modelsDir: modelsRootDir,
    pythonBin:
      String(input?.pythonBin || config.pythonBin || "").trim() || undefined,
    ...(config.command ? { command: config.command } : {}),
    language:
      typeof config.language === "string" && config.language.trim()
        ? config.language.trim()
        : undefined,
    strategy: resolveVoiceStrategyByModel(activeModelId),
    installedModels: selectedModelIds,
  };
  await writeVoiceTranscriberConfig({
    runtime,
    value: nextConfig,
  });

  return {
    success: true,
    message: "voice transcriber installed",
    details: {
      modelIds: selectedModelIds,
      activeModel: activeModelId,
      modelsRootDir,
    },
  };
}

/**
 * 解析 voice 转写句柄。
 */
export async function resolveVoiceTranscriber(
  runtime: ExecutionContext,
): Promise<VoiceTranscriberHandle> {
  return {
    async transcribe(input) {
      try {
        const result = await transcribeVoiceAudio({
          runtime,
          audioPath: input.audioPath,
          language: input.language,
        });
        return {
          success: true,
          text: result.text,
        };
      } catch (error) {
        return {
          success: false,
          error: String(error),
        };
      }
    },
  };
}

/**
 * 执行一次 voice 转写。
 */
export async function transcribeWithVoiceDependency(params: {
  runtime: ExecutionContext;
  audioPath: string;
  language?: string;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  const transcriber = await resolveVoiceTranscriber(params.runtime);
  return transcriber.transcribe({
    audioPath: params.audioPath,
    ...(params.language ? { language: params.language } : {}),
  });
}
