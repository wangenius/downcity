/**
 * TTS Plugin Dependency Helper。
 *
 * 关键点（中文）
 * - TTS 的模型安装、配置读写与可用性检查都内聚在 plugin 内部。
 * - Console UI 只调用 plugin action，不直接理解底层资源结构。
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type {
  TtsInstallInput,
  TtsPluginConfig,
} from "@/types/TtsPlugin.js";
import type { TtsModelId } from "@/types/Tts.js";
import { persistProjectPluginConfig } from "@/main/plugin/ProjectConfigStore.js";
import {
  getTtsModelCatalogItem,
  resolveTtsModelId,
  TTS_MODEL_CATALOG,
} from "@/plugins/tts/runtime/Catalog.js";
import {
  detectLocalTtsModelInstallState,
  installTtsModelFromHuggingFace,
} from "@/plugins/tts/runtime/Installer.js";
import {
  installTtsDependencies,
  resolveTtsRunnersByModels,
} from "@/plugins/tts/runtime/DependencyInstaller.js";
import { resolveTtsModelsRootDir } from "@/plugins/tts/runtime/Paths.js";

const execFileAsync = promisify(execFileCb);

export interface TtsDependencyCheckResult {
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

export interface TtsDependencyInstallResult {
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

function readTtsPluginRecord(context: ExecutionContext): Record<string, unknown> {
  const current = context.config.plugins?.tts;
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

function normalizeFormat(value: unknown): "wav" | "flac" {
  return String(value || "").trim().toLowerCase() === "flac" ? "flac" : "wav";
}

/**
 * 读取 TTS Plugin 配置。
 */
export function readTtsPluginConfig(context: ExecutionContext): TtsPluginConfig {
  const current = readTtsPluginRecord(context);
  return {
    enabled: current.enabled === true,
    provider: "local",
    ...(typeof current.modelId === "string" ? { modelId: current.modelId } : {}),
    ...(typeof current.modelsDir === "string" ? { modelsDir: current.modelsDir } : {}),
    ...(typeof current.pythonBin === "string" ? { pythonBin: current.pythonBin } : {}),
    ...(typeof current.language === "string" ? { language: current.language } : {}),
    ...(typeof current.voice === "string" ? { voice: current.voice } : {}),
    ...(typeof current.outputDir === "string" ? { outputDir: current.outputDir } : {}),
    ...(typeof current.timeoutMs === "number" ? { timeoutMs: current.timeoutMs } : {}),
    ...(typeof current.speed === "number" ? { speed: current.speed } : {}),
    format: normalizeFormat(current.format),
    ...(Array.isArray(current.installedModels)
      ? { installedModels: current.installedModels }
      : {}),
  };
}

/**
 * 写入完整 TTS plugin 配置。
 */
export async function writeTtsPluginConfig(params: {
  /**
   * 当前执行上下文。
   */
  context: ExecutionContext;
  /**
   * 目标配置值。
   */
  value: TtsPluginConfig;
}): Promise<TtsPluginConfig> {
  if (!params.context.config.plugins) {
    params.context.config.plugins = {};
  }
  params.context.config.plugins.tts = toJsonObject(params.value);
  await persistProjectPluginConfig({
    projectRoot: params.context.rootPath,
    sections: {
      plugins: params.context.config.plugins,
    },
  });
  return params.context.config.plugins.tts as TtsPluginConfig;
}

async function checkPythonPackageImports(params: {
  pythonBin: string;
  modelId: TtsModelId;
}): Promise<string | null> {
  const importScript =
    params.modelId === "qwen3-tts-0.6b"
      ? "import qwen_tts, soundfile"
      : "import kokoro, soundfile";
  try {
    await execFileAsync(params.pythonBin, ["-c", importScript], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return null;
  } catch (error) {
    return `python packages missing: ${String(error)}`;
  }
}

/**
 * 检查 TTS 依赖可用性。
 */
export async function checkTtsSynthesizer(
  context: ExecutionContext,
): Promise<TtsDependencyCheckResult> {
  const config = readTtsPluginConfig(context);
  const reasons: string[] = [];
  const modelId = resolveTtsModelId(String(config.modelId || ""));
  if (!modelId) {
    reasons.push("tts modelId is missing");
    return {
      available: false,
      reasons,
    };
  }

  const modelsRootDir = resolveTtsModelsRootDir({
    projectRoot: context.rootPath,
    modelsDir: config.modelsDir,
  });
  const installState = await detectLocalTtsModelInstallState({
    modelId,
    modelsRootDir,
  });
  if (!installState.installed) {
    reasons.push(`tts model is not installed: ${modelId}`);
  }

  const pythonBin = String(config.pythonBin || "").trim() || "python3";
  try {
    await execFileAsync(pythonBin, ["--version"], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    reasons.push(`python runtime missing: ${String(error)}`);
    return {
      available: false,
      reasons,
    };
  }

  const importError = await checkPythonPackageImports({
    pythonBin,
    modelId,
  });
  if (importError) {
    reasons.push(importError);
  }

  return {
    available: reasons.length === 0,
    reasons,
    details: {
      modelDir: installState.modelDir,
      source: installState.source || null,
    },
  };
}

/**
 * 安装或修复 TTS 依赖。
 */
export async function installTtsSynthesizer(params: {
  /**
   * 当前执行上下文。
   */
  context: ExecutionContext;
  /**
   * 安装输入（可选）。
   */
  input?: TtsInstallInput;
}): Promise<TtsDependencyInstallResult> {
  const context = params.context;
  const input = params.input;
  const config = readTtsPluginConfig(context);

  const requestedModelIds =
    (Array.isArray(input?.modelIds) ? input.modelIds : [])
      .map((item) => resolveTtsModelId(String(item || "").trim()))
      .filter((item): item is TtsModelId => Boolean(item));
  const selectedModelIds: TtsModelId[] =
    requestedModelIds.length > 0
      ? requestedModelIds
      : [resolveTtsModelId(String(config.modelId || "qwen3-tts-0.6b")) || "qwen3-tts-0.6b"];

  const modelsRootDir = resolveTtsModelsRootDir({
    projectRoot: context.rootPath,
    modelsDir: input?.modelsDir || config.modelsDir,
  });

  const installResults: JsonObject[] = [];
  for (const modelId of selectedModelIds) {
    const model = getTtsModelCatalogItem(modelId);
    if (!model) {
      throw new Error(`Unsupported tts model: ${modelId}`);
    }
    const installState = await detectLocalTtsModelInstallState({
      modelId,
      modelsRootDir,
    });
    if (!installState.installed || input?.force === true) {
      const result = await installTtsModelFromHuggingFace({
        model,
        modelsRootDir,
        force: input?.force === true,
        hfToken: input?.hfToken,
      });
      installResults.push(toJsonObject({
        modelId,
        downloadedFiles: result.downloadedFiles,
        skippedFiles: result.skippedFiles,
      }));
      continue;
    }
    installResults.push(toJsonObject({
      modelId,
      downloadedFiles: 0,
      skippedFiles: 0,
      reused: true,
    }));
  }

  let resolvedPythonBin = String(input?.pythonBin || config.pythonBin || "").trim() || "python3";
  let dependencyDetails: JsonValue | undefined;
  if (input?.installDeps !== false) {
    const dependencyResult = await installTtsDependencies({
      pythonBin: resolvedPythonBin,
      runners: resolveTtsRunnersByModels(selectedModelIds),
    });
    resolvedPythonBin = dependencyResult.pythonBin;
    dependencyDetails = toJsonObject({
      pythonBin: dependencyResult.pythonBin,
      runners: dependencyResult.runners,
      usedVirtualEnv: dependencyResult.usedVirtualEnv,
      venvDir: dependencyResult.venvDir,
    });
  }

  const activeModelId =
    resolveTtsModelId(String(input?.activeModel || "")) || selectedModelIds[0];
  const nextConfig = await writeTtsPluginConfig({
    context,
    value: {
      ...config,
      enabled: true,
      provider: "local",
      modelId: activeModelId,
      modelsDir: modelsRootDir,
      pythonBin: resolvedPythonBin,
      format: normalizeFormat(input?.format || config.format),
      installedModels: selectedModelIds,
    },
  });

  return {
    success: true,
    message: "tts synthesizer installed",
    details: {
      plugin: toJsonObject(nextConfig as Record<string, unknown>),
      models: installResults,
      dependency: dependencyDetails || null,
    },
  };
}

/**
 * 列出可用于 TTS 的内置模型选项。
 */
export function listTtsModelOptions(): Array<{
  /**
   * 选项标签。
   */
  label: string;
  /**
   * 选项值。
   */
  value: string;
  /**
   * 选项说明。
   */
  hint: string;
}> {
  return TTS_MODEL_CATALOG.map((item) => ({
    label: item.label,
    value: item.id,
    hint: item.description,
  }));
}
