/**
 * 前台启动 Agent Runtime（当前终端进程内运行）。
 *
 * 场景
 * - `sma agent start --foreground` 走这里（当前终端前台运行）
 * - daemon 子进程也复用这里作为真正运行入口
 *
 * 说明
 * - 后台常驻启动请使用 `shipmyagent agent start`，并用
 *   `shipmyagent agent restart` 管理。
 */

import { startServer } from "@/console/index.js";

import {
  getServiceRuntimeState,
  getRuntimeState,
  initRuntimeState,
  stopRuntimeHotReload,
} from "@/agent/context/manager/RuntimeState.js";
import type { StartOptions } from "@agent/types/Start.js";
import { logger } from "@utils/logger/Logger.js";
import {
  startAllServiceRuntimes,
  stopAllServiceRuntimes,
} from "@agent/service/Manager.js";
import {
  startAllExtensionRuntimes,
  stopAllExtensionRuntimes,
} from "@console/extension/Manager.js";

/**
 * 运行态启动入口（由 `agent start` 前台模式与内部 daemon 子进程复用）。
 *
 * 职责（中文）
 * - 初始化 runtime 状态（配置、日志、services 依赖）
 * - 解析并合并启动参数（CLI > ship.json > 默认值）
 * - 启动主 HTTP 服务
 * - 启动 service runtimes（例如 task cron）
 * - 统一处理进程信号并优雅停机
 */
export async function runCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  // 初始化加载（进程级单例运行时状态：root/config/utils/logger/chat/agents 等）
  await initRuntimeState(cwd);
  // 端口解析（中文）：允许 number/string；空值返回 undefined 以便走配置回退链。
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
    console.error("❌ Invalid start options:", error);
    process.exit(1);
  }

  const host = (options.host ?? "0.0.0.0").trim();

  process.env.SMA_SERVER_PORT = String(port);
  process.env.SMA_SERVER_HOST = host;

  // Create and start server
  const server = await startServer({
    port,
    host,
  });

  // 处理进程信号
  // 停机顺序（中文）：services -> extensions -> API server -> flush logs。
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal} signal, shutting down...`);

    // 先停掉文件监听，避免关停阶段触发额外重载。
    stopRuntimeHotReload();

    // Stop service runtimes
    try {
      await stopAllServiceRuntimes(getServiceRuntimeState());
    } catch {
      // ignore
    }

    // Stop extension runtimes
    try {
      await stopAllExtensionRuntimes(getServiceRuntimeState());
    } catch {
      // ignore
    }

    // 停止服务器
    await server.stop();

    // Save logs
    await logger.saveAllLogs();

    logger.info("👋 ShipMyAgent stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 启动 extension runtimes（优先于 service，供 service 调用）。
  try {
    const extensionLifecycle = await startAllExtensionRuntimes(
      getServiceRuntimeState(),
    );
    for (const item of extensionLifecycle.results) {
      if (item.success) continue;
      logger.error(
        `Extension runtime start failed: ${item.extension?.name || "unknown"} - ${item.error || "unknown error"}`,
      );
    }
  } catch (e) {
    logger.error(`Extension runtime bootstrap failed: ${String(e)}`);
  }

  // 启动 service runtimes（含 task cron 等模块内生命周期逻辑）
  // 调度策略（中文）：单服务失败不阻断主服务启动，仅记录日志。
  try {
    const lifecycle = await startAllServiceRuntimes(getServiceRuntimeState());
    for (const item of lifecycle.results) {
      if (item.success) continue;
      logger.error(
        `Service runtime start failed: ${item.service?.name || "unknown"} - ${item.error || "unknown error"}`,
      );
    }
  } catch (e) {
    logger.error(`Service runtime bootstrap failed: ${String(e)}`);
  }

  logger.info("=== ShipMyAgent Started ===");
}
