/**
 * 前台启动 Agent 进程（当前终端进程内运行）。
 *
 * 场景
 * - `city agent start --foreground` 走这里（当前终端前台运行）
 * - daemon 子进程也复用这里作为真正运行入口
 *
 * 说明
 * - 后台常驻启动请使用 `downcity agent start`，并用
 *   `downcity agent restart` 管理。
 */

import path from "node:path";
import {
  Agent,
  loadStaticSystemPrompts,
  shellTools,
  StaticPromptCatalog,
} from "@downcity/agent";
import type { StartOptions } from "@downcity/agent";
import { CliError } from "../shared/CliError.js";
import { createAgentPlatformRuntime } from "@/process/registry/AgentHostRuntime.js";
import { createRuntimeModel } from "@/model/runtime/CreateRuntimeModel.js";
import { resolveAgentName } from "../shared/IndexSupport.js";

/**
 * 前台启动入口（由 `agent start` 前台模式与内部 daemon 子进程复用）。
 *
 * 职责（中文）
 * - 初始化 agent 状态（配置、日志、services 依赖）
 * - 解析并合并启动参数（CLI > downcity.json > 默认值）
 * - 启动主 HTTP 服务
 * - 启动 services（例如 task cron）
 * - 统一处理进程信号并优雅停机
 */
export async function runCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);
  const platform = createAgentPlatformRuntime();
  // 端口解析（中文）：允许 number / string；空值返回 undefined 以便走配置回退链。
  const parsePort = (
    value: string | number | undefined,
    label: string,
  ): number | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    const num =
      typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      throw new Error(`${label} must be a number`);
    }
    if (!Number.isInteger(num) || num <= 0 || num > 65535) {
      throw new Error(`${label} must be an integer between 1 and 65535`);
    }
    return num;
  };
  // Resolve startup options: CLI flags override built-in defaults.
  let port: number;
  try {
    port = parsePort(options.port, "port") ?? 5314;
  } catch (error) {
    throw new CliError({
      title: "Invalid start options",
      note: error instanceof Error ? error.message : String(error),
    });
  }

  const host = (options.host ?? "0.0.0.0").trim();
  const agentName = resolveAgentName(projectRoot);
  let currentSystems = loadStaticSystemPrompts(projectRoot);

  const agent = new Agent({
    id: agentName,
    path: projectRoot,
    instruction: currentSystems,
    tools: shellTools,
    platform,
    useBuiltinServices: true,
    useBuiltinPlugins: true,
    configureSession: async (session) => {
      const model = await createRuntimeModel({
        config: agent.getRuntime().config,
        platform,
      });
      await session.set({
        model,
      });
    },
  });

  const promptCatalog = new StaticPromptCatalog({
    rootPath: projectRoot,
    logger: agent.getRuntime().logger,
    getCurrentSystems: () => currentSystems,
    applySystems: (nextSystems) => {
      currentSystems = nextSystems;
      agent.setInstruction(nextSystems);
    },
  });
  promptCatalog.start();

  process.env.DC_SERVER_PORT = String(port);
  process.env.DC_SERVER_HOST = host;
  process.env.DC_AGENT_PATH = projectRoot;
  process.env.DC_AGENT_NAME = agentName;

  const startResult = await agent.start({
    http: {
      port,
      host,
    },
    rpc: true,
    services: true,
  });

  const server = startResult.http?.server;
  const localRpc = startResult.rpc?.server;
  if (!server || !localRpc) {
    throw new Error("Agent start did not return expected HTTP/RPC bindings");
  }

  const agentLogger = agent.getRuntime().logger;

  // 处理进程信号
  // 停机顺序（中文）：services -> API server -> flush logs。
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    agentLogger.info(`Received ${signal} signal, shutting down...`);
    promptCatalog.stop();

    await agent.stop();

    // Save logs
    await agentLogger.saveAllLogs();

    agentLogger.info("👋 Downcity stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  agentLogger.info("=== Downcity Started ===");
}
