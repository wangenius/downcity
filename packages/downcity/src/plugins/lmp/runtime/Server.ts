/**
 * LMP / llama.cpp server 启动与复用。
 *
 * 关键点（中文）
 * - 本模块只负责 `llama-server` 进程管理与 OpenAI-compatible 地址复用。
 * - 具体使用哪个模型、是否允许自动启动，都由 `plugins.lmp` 配置决定。
 * - 同一份运行配置在当前进程内只会启动一次，避免重复拉起多个本地服务。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "fs-extra";
import { allocateAvailablePort } from "@/main/city/daemon/PortAllocator.js";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { ResolvedLmpRuntimeConfig } from "@/plugins/lmp/runtime/Config.js";

type LocalLlamaServerHandle = {
  /**
   * 实际监听端口。
   */
  port: number;

  /**
   * OpenAI-compatible baseUrl。
   */
  baseUrl: string;

  /**
   * 模型别名。
   */
  modelName: string;

  /**
   * 子进程句柄。
   */
  child?: ChildProcessWithoutNullStreams;
};

const serverByKey = new Map<string, Promise<LocalLlamaServerHandle>>();

function buildServerKey(config: ResolvedLmpRuntimeConfig): string {
  return JSON.stringify({
    modelPath: config.modelPath,
    command: config.command,
    args: config.args,
    host: config.host,
    port: config.port,
    contextSize: config.contextSize,
    gpuLayers: config.gpuLayers,
    autoStart: config.autoStart,
  });
}

function buildBaseUrl(host: string, port: number): string {
  const connectHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${connectHost}:${port}/v1`;
}

function buildLlamaServerArgs(
  config: ResolvedLmpRuntimeConfig,
  port: number,
): string[] {
  const args = [
    "-m",
    config.modelPath,
    "--host",
    config.host,
    "--port",
    String(port),
    "--alias",
    config.modelName,
    "--ctx-size",
    String(config.contextSize),
  ];
  if (config.gpuLayers !== undefined) {
    args.push("-ngl", String(config.gpuLayers));
  }
  return [...args, ...config.args];
}

async function waitForServerReady(params: {
  baseUrl: string;
  child?: ChildProcessWithoutNullStreams;
  logger: Logger;
  commandLabel: string;
}): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 30_000;
  let childExited = false;

  params.child?.once("exit", () => {
    childExited = true;
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (childExited) {
      throw new Error(`Local llama server exited before ready: ${params.commandLabel}`);
    }
    try {
      const response = await fetch(`${params.baseUrl}/models`, {
        method: "GET",
      });
      if (response.ok) return;
    } catch {
      // 关键点（中文）：启动阶段服务未就绪时允许短暂失败，轮询等待即可。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await params.logger.log("warn", "[lmp] startup_timeout", {
    baseUrl: params.baseUrl,
    command: params.commandLabel,
  });
  throw new Error(`Timed out waiting for local llama server: ${params.commandLabel}`);
}

/**
 * 确保本地 llama.cpp server 已就绪。
 */
export async function ensureLmpLocalServer(params: {
  /**
   * 归一化后的 LMP runtime 配置。
   */
  config: ResolvedLmpRuntimeConfig;

  /**
   * 统一日志器。
   */
  logger: Logger;
}): Promise<{
  /**
   * OpenAI-compatible baseUrl。
   */
  baseUrl: string;

  /**
   * 请求时使用的模型别名。
   */
  modelName: string;
}> {
  const key = buildServerKey(params.config);
  const cached = serverByKey.get(key);
  if (cached) {
    const ready = await cached;
    return {
      baseUrl: ready.baseUrl,
      modelName: ready.modelName,
    };
  }

  const pending = (async (): Promise<LocalLlamaServerHandle> => {
    if (!(await fs.pathExists(params.config.modelPath))) {
      throw new Error(`Local llama model file not found: ${params.config.modelPath}`);
    }

    const port = params.config.port || await allocateAvailablePort({
      host: params.config.host,
      start: 43100,
      end: 43999,
    });
    const baseUrl = buildBaseUrl(params.config.host, port);

    if (params.config.autoStart === false) {
      await waitForServerReady({
        baseUrl,
        logger: params.logger,
        commandLabel: `${params.config.command} (reuse-only)`,
      });
      return {
        port,
        baseUrl,
        modelName: params.config.modelName,
      };
    }

    const childArgs = buildLlamaServerArgs(params.config, port);
    const commandLabel = `${params.config.command} ${childArgs.join(" ")}`;

    await params.logger.log("info", "[lmp] spawn_llama_server", {
      command: params.config.command,
      args: childArgs,
      modelPath: params.config.modelPath,
      baseUrl,
    });

    const child = spawn(params.config.command, childArgs, {
      cwd: params.config.projectRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      void params.logger.log("info", "[lmp] stdout", {
        data: String(chunk || "").trim(),
      });
    });

    child.stderr.on("data", (chunk) => {
      void params.logger.log("warn", "[lmp] stderr", {
        data: String(chunk || "").trim(),
      });
    });

    await waitForServerReady({
      baseUrl,
      child,
      logger: params.logger,
      commandLabel,
    });

    return {
      port,
      baseUrl,
      modelName: params.config.modelName,
      child,
    };
  })();

  serverByKey.set(key, pending);

  try {
    const ready = await pending;
    return {
      baseUrl: ready.baseUrl,
      modelName: ready.modelName,
    };
  } catch (error) {
    serverByKey.delete(key);
    throw error;
  }
}
