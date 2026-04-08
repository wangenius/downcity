/**
 * LMP runtime 配置解析与持久化。
 *
 * 关键点（中文）
 * - 统一把 `plugins.lmp` 解析成 local executor 可直接消费的运行时配置。
 * - `execution.type = "local"` 不再携带模型细节，所有本地模型参数都从这里读取。
 * - 该模块同时承担读写 `downcity.json.plugins.lmp` 的最小 helper，避免实现散落。
 */

import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import type { AgentPluginConfigRuntime } from "@/shared/types/AgentHost.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { LmpPluginConfig } from "@/shared/types/LmpPlugin.js";

/**
 * 归一化后的 LMP runtime 配置。
 */
export interface ResolvedLmpRuntimeConfig {
  /**
   * 当前项目根目录绝对路径。
   */
  projectRoot: string;

  /**
   * 当前本地 provider。
   */
  provider: "llama";

  /**
   * 模型根目录绝对路径。
   */
  modelsDir: string;

  /**
   * 当前激活模型的原始声明值。
   */
  model: string;

  /**
   * 当前激活模型的绝对路径。
   */
  modelPath: string;

  /**
   * 对外暴露给 OpenAI-compatible 接口的模型别名。
   */
  modelName: string;

  /**
   * `llama-server` 命令。
   */
  command: string;

  /**
   * 额外启动参数。
   */
  args: string[];

  /**
   * 服务监听 host。
   */
  host: string;

  /**
   * 服务监听端口。
   */
  port?: number;

  /**
   * 上下文窗口大小。
   */
  contextSize: number;

  /**
   * GPU offload 层数。
   */
  gpuLayers?: number;

  /**
   * 是否允许自动启动本地服务。
   */
  autoStart: boolean;

  /**
   * 当前扫描到的本地 GGUF 模型列表。
   */
  installedModels: string[];
}

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject | null {
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
 * 展开 `~/...` 路径。
 */
export function expandHomePath(inputPath: string): string {
  const raw = String(inputPath || "").trim();
  if (!raw) return raw;
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

function sanitizeModelAlias(modelPath: string): string {
  const parsed = path.parse(modelPath);
  const base = String(parsed.name || "local-llama")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "local-llama";
}

/**
 * 读取 `plugins.lmp` 配置并做最小归一化。
 */
export function readLmpPluginConfig(input: {
  plugins?: Record<string, unknown>;
}): LmpPluginConfig {
  const current = input.plugins?.lmp;
  const normalized =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as LmpPluginConfig)
      : {};
  return {
    provider: normalized.provider === "llama" ? "llama" : "llama",
    ...(typeof normalized.model === "string" ? { model: normalized.model.trim() } : {}),
    ...(typeof normalized.modelsDir === "string"
      ? { modelsDir: normalized.modelsDir.trim() }
      : {}),
    ...(typeof normalized.command === "string" ? { command: normalized.command.trim() } : {}),
    ...(Array.isArray(normalized.args)
      ? {
          args: normalized.args
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        }
      : {}),
    ...(typeof normalized.host === "string" ? { host: normalized.host.trim() } : {}),
    ...(Number.isInteger(normalized.port) && Number(normalized.port) > 0
      ? { port: Number(normalized.port) }
      : {}),
    ...(Number.isInteger(normalized.contextSize) && Number(normalized.contextSize) > 0
      ? { contextSize: Number(normalized.contextSize) }
      : {}),
    ...(Number.isInteger(normalized.gpuLayers)
      ? { gpuLayers: Number(normalized.gpuLayers) }
      : {}),
    autoStart:
      typeof normalized.autoStart === "boolean"
        ? normalized.autoStart
        : true,
    ...(Array.isArray(normalized.installedModels)
      ? {
          installedModels: normalized.installedModels
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        }
      : {}),
  };
}

/**
 * 写入完整 `plugins.lmp` 配置。
 */
export async function writeLmpPluginConfig(params: {
  config: DowncityConfig;
  pluginConfig: AgentPluginConfigRuntime;
  value: LmpPluginConfig;
}): Promise<LmpPluginConfig> {
  if (!params.config.plugins) {
    params.config.plugins = {};
  }
  params.config.plugins.lmp = (toJsonObject({
    ...params.value,
    provider: "llama",
  } as Record<string, unknown>) || {}) as JsonObject;
  await params.pluginConfig.persistProjectPlugins(params.config.plugins);
  return readLmpPluginConfig(params.config);
}

/**
 * 解析 LMP 目标模型目录。
 */
export function resolveLmpModelsDir(params: {
  projectRoot: string;
  config: DowncityConfig;
}): string {
  const projectRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const plugin = readLmpPluginConfig(params.config);
  const modelsDirRaw = expandHomePath(String(plugin.modelsDir || "~/.models").trim());
  return path.isAbsolute(modelsDirRaw)
    ? path.resolve(modelsDirRaw)
    : path.resolve(projectRoot, modelsDirRaw);
}

/**
 * 扫描本地 GGUF 模型文件。
 */
export async function listLocalGgufModels(params: {
  projectRoot: string;
  config: DowncityConfig;
  modelsDir?: string;
}): Promise<string[]> {
  const projectRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const modelsDirRaw = String(
    params.modelsDir || resolveLmpModelsDir({ projectRoot, config: params.config }),
  ).trim();
  const modelsDir = path.isAbsolute(modelsDirRaw)
    ? path.resolve(modelsDirRaw)
    : path.resolve(projectRoot, modelsDirRaw);
  const matches = await fg(["*.gguf", "**/*.gguf"], {
    cwd: modelsDir,
    onlyFiles: true,
  }).catch(() => []);
  return matches
    .map((item) => item.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 解析 local executor 运行时所需的 LMP 配置。
 */
export function resolveLmpRuntimeConfig(params: {
  projectRoot: string;
  config: DowncityConfig;
}): ResolvedLmpRuntimeConfig {
  const projectRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const plugin = readLmpPluginConfig(params.config);
  const model = String(plugin.model || "").trim();
  if (!model) {
    throw new Error('plugins.lmp.model is required when execution.type="local"');
  }

  const modelsDir = resolveLmpModelsDir({
    projectRoot,
    config: params.config,
  });
  const modelPath = path.isAbsolute(model)
    ? path.resolve(expandHomePath(model))
    : path.resolve(modelsDir, model);
  const installedModels = fg.sync(["*.gguf", "**/*.gguf"], {
    cwd: modelsDir,
    onlyFiles: true,
  })
    .map((item) => item.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b));

  return {
    projectRoot,
    provider: "llama",
    modelsDir,
    model,
    modelPath,
    modelName: sanitizeModelAlias(modelPath),
    command: String(plugin.command || "").trim() || "llama-server",
    args: Array.isArray(plugin.args) ? plugin.args : [],
    host: String(plugin.host || "").trim() || "127.0.0.1",
    ...(plugin.port !== undefined ? { port: plugin.port } : {}),
    contextSize: plugin.contextSize || 8192,
    ...(plugin.gpuLayers !== undefined ? { gpuLayers: plugin.gpuLayers } : {}),
    autoStart: plugin.autoStart !== false,
    installedModels,
  };
}
