/**
 * TTS Plugin Dependency Helper。
 *
 * 关键点（中文）
 * - TTS 的模型安装、配置读写与可用性检查都内聚在 plugin 内部。
 * - Console 只调用 plugin action，不直接理解底层资源结构。
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { PluginCommandContext } from "@/shared/types/Plugin.js";
import type {
  TtsInstallInput,
  TtsPluginConfig,
} from "@/shared/types/TtsPlugin.js";
import type { TtsModelId } from "@/shared/types/Tts.js";
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
  ensureTtsVirtualEnv,
  installTtsDependencies,
  resolveDefaultTtsVenvPythonBin,
  resolveTtsRunnersByModels,
} from "@/plugins/tts/runtime/DependencyInstaller.js";
import { resolveTtsModelsRootDir } from "@/plugins/tts/runtime/Paths.js";

const execFileAsync = promisify(execFileCb);

type PythonVersionInfo = {
  major: number;
  minor: number;
  patch: number;
  raw: string;
};

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

function readTtsPluginRecord(context: PluginCommandContext): Record<string, unknown> {
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

function normalizeTtsPythonBin(value: unknown): string {
  const text = String(value || "").trim();
  if (!text || text === "python3") {
    return resolveDefaultTtsVenvPythonBin();
  }
  return text;
}

async function readPythonVersionInfo(pythonBin: string): Promise<PythonVersionInfo | null> {
  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, ["--version"], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    const text = String(stdout || stderr || "").trim();
    const match = text.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      raw: text,
    };
  } catch {
    return null;
  }
}

function getTtsPythonCompatibilityReason(params: {
  modelId: TtsModelId;
  version: PythonVersionInfo | null;
}): string | null {
  if (!params.version) return null;
  if (params.modelId === "kokoro-82m") {
    if (params.version.major > 3 || (params.version.major === 3 && params.version.minor >= 13)) {
      return `kokoro-82m currently requires Python < 3.13, current is ${params.version.major}.${params.version.minor}.${params.version.patch}`;
    }
  }
  return null;
}

/**
 * 读取 TTS Plugin 配置。
 */
export function readTtsPluginConfig(context: PluginCommandContext): TtsPluginConfig {
  const current = readTtsPluginRecord(context);
  return {
    enabled: current.enabled === true,
    provider: "local",
    ...(typeof current.modelId === "string" ? { modelId: current.modelId } : {}),
    ...(typeof current.modelsDir === "string" ? { modelsDir: current.modelsDir } : {}),
    pythonBin: normalizeTtsPythonBin(current.pythonBin),
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
  context: PluginCommandContext;
  /**
   * 目标配置值。
   */
  value: TtsPluginConfig;
}): Promise<TtsPluginConfig> {
  if (!params.context.config.plugins) {
    params.context.config.plugins = {};
  }
  params.context.config.plugins.tts = toJsonObject(params.value);
  await params.context.pluginConfig.persistProjectPlugins(params.context.config.plugins);
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
  context: PluginCommandContext,
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

  const pythonBin = normalizeTtsPythonBin(config.pythonBin);
  const pythonVersion = await readPythonVersionInfo(pythonBin);
  if (!pythonVersion) {
    reasons.push(`python runtime missing: ${pythonBin}`);
    return {
      available: false,
      reasons,
    };
  }

  const compatibilityReason = getTtsPythonCompatibilityReason({
    modelId,
    version: pythonVersion,
  });
  if (compatibilityReason) {
    reasons.push(compatibilityReason);
    return {
      available: false,
      reasons,
      details: {
        modelDir: installState.modelDir,
        source: installState.source || null,
        pythonVersion: pythonVersion.raw,
      },
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
  context: PluginCommandContext;
  /**
   * 安装输入（可选）。
   */
  input?: TtsInstallInput;
}): Promise<TtsDependencyInstallResult> {
  const context = params.context;
  const input = params.input;
  const config = readTtsPluginConfig(context);
  const logs: string[] = [];

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
  logs.push(`models dir: ${modelsRootDir}`);

  const installResults: JsonObject[] = [];
  for (const modelId of selectedModelIds) {
    logs.push(`prepare model: ${modelId}`);
    const model = getTtsModelCatalogItem(modelId);
    if (!model) {
      throw new Error(`Unsupported tts model: ${modelId}`);
    }
    const installState = await detectLocalTtsModelInstallState({
      modelId,
      modelsRootDir,
    });
    if (!installState.installed || input?.force === true) {
      logs.push(
        installState.installed && input?.force === true
          ? `redownload model: ${modelId}`
          : `download model: ${modelId}`,
      );
      const result = await installTtsModelFromHuggingFace({
        model,
        modelsRootDir,
        force: input?.force === true,
        hfToken: input?.hfToken,
      });
      logs.push(
        `model ready: ${modelId} (downloaded ${result.downloadedFiles}, skipped ${result.skippedFiles})`,
      );
      installResults.push(toJsonObject({
        modelId,
        downloadedFiles: result.downloadedFiles,
        skippedFiles: result.skippedFiles,
      }));
      continue;
    }
    logs.push(`reuse installed model: ${modelId}`);
    installResults.push(toJsonObject({
      modelId,
      downloadedFiles: 0,
      skippedFiles: 0,
      reused: true,
    }));
  }

  const basePythonBin = String(input?.pythonBin || "").trim() || "python3";
  const basePythonVersion = await readPythonVersionInfo(basePythonBin);
  let resolvedPythonBin = normalizeTtsPythonBin(config.pythonBin);
  let dependencyDetails: JsonValue | undefined;
  const compatibilityFailures = selectedModelIds
    .map((modelId) => getTtsPythonCompatibilityReason({
      modelId,
      version: basePythonVersion,
    }))
    .filter((item): item is string => Boolean(item));
  if (compatibilityFailures.length > 0) {
    logs.push(...compatibilityFailures);
    return {
      success: false,
      message: compatibilityFailures.join(" · "),
      details: {
        pythonVersion: basePythonVersion?.raw || basePythonBin,
        logs,
      },
    };
  }
  if (input?.installDeps !== false) {
    logs.push(`prepare python env from: ${basePythonBin}`);
    const dependencyResult = await installTtsDependencies({
      pythonBin: basePythonBin,
      runners: resolveTtsRunnersByModels(selectedModelIds),
    });
    resolvedPythonBin = dependencyResult.pythonBin;
    logs.push(`python env ready: ${dependencyResult.pythonBin}`);
    for (const item of dependencyResult.items) {
      logs.push(
        item.skipped
          ? `dependency ${item.runner}: already installed`
          : `dependency ${item.runner}: installed`,
      );
    }
    dependencyDetails = toJsonObject({
      pythonBin: dependencyResult.pythonBin,
      runners: dependencyResult.runners,
      usedVirtualEnv: dependencyResult.usedVirtualEnv,
      venvDir: dependencyResult.venvDir,
    });
  } else {
    logs.push(`prepare python env only: ${basePythonBin}`);
    resolvedPythonBin = await ensureTtsVirtualEnv({
      basePythonBin,
    });
    logs.push(`python env ready: ${resolvedPythonBin}`);
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
      logs,
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
