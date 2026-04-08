/**
 * LMP 依赖与安装 helper。
 *
 * 关键点（中文）
 * - 这里收敛 `llama-server` / `hf` 命令检查、本地 GGUF 扫描、Hugging Face 下载逻辑。
 * - plugin action 只负责参数映射与结果组织，具体副作用实现统一放到这里。
 * - 当前阶段优先支持单文件 GGUF 下载到 `~/.models`。
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import type { PluginCommandContext } from "@/shared/types/Plugin.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { LmpInstallInput } from "@/shared/types/LmpPlugin.js";
import {
  listLocalGgufModels,
  readLmpPluginConfig,
  resolveLmpModelsDir,
  resolveLmpRuntimeConfig,
  writeLmpPluginConfig,
} from "@/plugins/lmp/runtime/Config.js";

type CommandCheckResult = {
  available: boolean;
  reason?: string;
};

export interface LmpDoctorResult {
  /**
   * 当前插件是否可直接用于 local executor。
   */
  available: boolean;

  /**
   * 不可用原因列表。
   */
  reasons: string[];

  /**
   * 结构化状态详情。
   */
  details: JsonObject;
}

function checkCommandExists(command: string): CommandCheckResult {
  const normalized = String(command || "").trim();
  if (!normalized) {
    return {
      available: false,
      reason: "command is empty",
    };
  }
  const result = spawnSync(normalized, ["--help"], {
    stdio: "ignore",
    timeout: 3_000,
  });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    return {
      available: false,
      reason: `${normalized} not found in PATH`,
    };
  }
  return {
    available: true,
  };
}

/**
 * 检查 LMP 依赖状态。
 */
export async function checkLmpEnvironment(
  context: PluginCommandContext,
): Promise<LmpDoctorResult> {
  const plugin = readLmpPluginConfig(context.config);
  const details: JsonObject = {
    provider: plugin.provider || "llama",
  };
  const reasons: string[] = [];
  const modelsDir = resolveLmpModelsDir({
    projectRoot: context.rootPath,
    config: context.config,
  });
  const models = await listLocalGgufModels({
    projectRoot: context.rootPath,
    config: context.config,
    modelsDir,
  });
  details.modelsDir = modelsDir;
  details.installedModels = models;
  details.model = plugin.model || null;
  details.command = plugin.command || "llama-server";
  details.autoStart = plugin.autoStart !== false;

  const llamaCheck = checkCommandExists(String(plugin.command || "").trim() || "llama-server");
  details.llamaServerAvailable = llamaCheck.available;
  if (!llamaCheck.available && llamaCheck.reason) {
    reasons.push(llamaCheck.reason);
  }

  const hfCheck = checkCommandExists("hf");
  details.hfAvailable = hfCheck.available;
  if (!hfCheck.available && hfCheck.reason) {
    details.hfReason = hfCheck.reason;
  }

  try {
    const resolved = resolveLmpRuntimeConfig({
      projectRoot: context.rootPath,
      config: context.config,
    });
    details.modelPath = resolved.modelPath;
    details.host = resolved.host;
    details.port = resolved.port || null;
    details.contextSize = resolved.contextSize;
    details.gpuLayers = resolved.gpuLayers ?? null;
    details.modelExists = await fs.pathExists(resolved.modelPath);
    if (details.modelExists !== true) {
      reasons.push(`Configured model file does not exist: ${resolved.modelPath}`);
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  return {
    available: reasons.length === 0,
    reasons,
    details,
  };
}

/**
 * 列出当前可选的本地 GGUF 模型。
 */
export async function listLmpModelOptions(context: PluginCommandContext): Promise<Array<{
  label: string;
  value: string;
}>> {
  const models = await listLocalGgufModels({
    projectRoot: context.rootPath,
    config: context.config,
  });
  return models.map((item) => ({
    label: item,
    value: item,
  }));
}

async function runCommand(params: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        ...(params.env || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: typeof code === "number" ? code : 1,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * 安装或激活本地模型。
 */
export async function installLmpModel(params: {
  context: PluginCommandContext;
  input: LmpInstallInput;
}): Promise<{
  config: JsonObject;
  logs: string[];
}> {
  const logs: string[] = [];
  const current = readLmpPluginConfig(params.context.config);
  const modelsDirRaw = String(
    params.input.modelsDir || current.modelsDir || "~/.models",
  ).trim();
  const modelsDir = path.isAbsolute(modelsDirRaw)
    ? path.resolve(modelsDirRaw)
    : path.resolve(params.context.rootPath, modelsDirRaw);
  await fs.ensureDir(modelsDir);

  const repoId = String(params.input.repoId || "").trim();
  const filename = String(params.input.filename || "").trim();
  const activeModel =
    String(params.input.activeModel || "").trim()
    || filename
    || String(current.model || "").trim();

  if (!params.input.skipDownload && repoId && filename) {
    const hfCheck = checkCommandExists("hf");
    if (!hfCheck.available) {
      throw new Error(
        `hf CLI is required for model download${hfCheck.reason ? `: ${hfCheck.reason}` : ""}`,
      );
    }
    logs.push(`Downloading ${repoId}/${filename} -> ${modelsDir}`);
    const result = await runCommand({
      command: "hf",
      args: ["download", repoId, filename, "--local-dir", modelsDir],
      cwd: params.context.rootPath,
      env: params.input.hfToken
        ? {
            HF_TOKEN: String(params.input.hfToken),
          }
        : undefined,
    });
    if (result.stdout.trim()) logs.push(result.stdout.trim());
    if (result.stderr.trim()) logs.push(result.stderr.trim());
    if (result.exitCode !== 0) {
      throw new Error(`hf download failed with exit code ${result.exitCode}`);
    }
  } else if (params.input.skipDownload) {
    logs.push("Skipped model download");
  }

  if (!activeModel) {
    throw new Error("activeModel or filename is required");
  }

  const modelPath = path.isAbsolute(activeModel)
    ? path.resolve(activeModel)
    : path.resolve(modelsDir, activeModel);
  if (!(await fs.pathExists(modelPath))) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  const installedModels = await listLocalGgufModels({
    projectRoot: params.context.rootPath,
    config: params.context.config,
    modelsDir,
  });
  const next = await writeLmpPluginConfig({
    config: params.context.config,
    pluginConfig: params.context.pluginConfig,
    value: {
      ...current,
      provider: "llama",
      modelsDir,
      model: activeModel,
      installedModels,
    },
  });
  logs.push(`Activated local model: ${activeModel}`);

  return {
    config: {
      ...(next as Record<string, unknown>),
    } as JsonObject,
    logs,
  };
}
