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
import { startServer } from "@/main/index.js";
import { ensureAgentToken, rotateAgentTokenIfNeeded } from "@/main/auth/AgentTokenService.js";
import { applyInternalAgentAuthEnv } from "@/main/auth/AuthEnv.js";

/**
 * Token 轮换检查间隔（毫秒）
 * 每 6 小时检查一次
 */
const TOKEN_ROTATION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

import {
  getExecutionContext,
  getAgentState,
  initAgentState,
  stopAgentHotReload,
} from "@agent/AgentState.js";
import type { StartOptions } from "@/types/Start.js";
import { logger } from "@utils/logger/Logger.js";
import {
  startAllServices,
  stopAllServices,
} from "@/main/service/Manager.js";
import {
  startServiceScheduleRuntime,
  stopServiceScheduleRuntime,
} from "@/main/service/schedule/Runtime.js";

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
  // 初始化加载（进程级单例状态：root/config/utils/logger/chat/agents 等）
  await initAgentState(cwd);
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

  process.env.DC_SERVER_PORT = String(port);
  process.env.DC_SERVER_HOST = host;

  // 为当前 Agent 签发专用 token（前台模式）
  const agentRoot = path.resolve(cwd);
  const agentToken = ensureAgentToken(agentRoot);
  applyInternalAgentAuthEnv({
    targetEnv: process.env,
    sourceEnv: process.env,
    token: agentToken.token,
  });

  // Create and start server
  const server = await startServer({
    port,
    host,
  });

  // 处理进程信号
  // 停机顺序（中文）：services -> API server -> flush logs。
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal} signal, shutting down...`);

    // 先停掉文件监听，避免关停阶段触发额外重载。
    stopAgentHotReload();

    // 先停持久化调度器，避免关停过程中继续触发新的 service action。
    try {
      await stopServiceScheduleRuntime();
    } catch {
      // ignore
    }

    // 停止全部 service
    try {
      await stopAllServices(getExecutionContext());
    } catch {
      // ignore
    }

    // 停止服务器
    await server.stop();

    // Save logs
    await logger.saveAllLogs();

    logger.info("👋 Downcity stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 启动全部 service（含 task cron 等模块内生命周期逻辑）
  // 调度策略（中文）：单服务失败不阻断主服务启动，仅记录日志。
  try {
    const lifecycle = await startAllServices(getExecutionContext());
    for (const item of lifecycle.results) {
      if (item.success) continue;
      logger.error(
        `Service start failed: ${item.service?.name || "unknown"} - ${item.error || "unknown error"}`,
      );
    }
  } catch (e) {
    logger.error(`Service bootstrap failed: ${String(e)}`);
  }

  try {
    await startServiceScheduleRuntime(getExecutionContext());
  } catch (e) {
    logger.error(`Service schedule runtime bootstrap failed: ${String(e)}`);
  }

  logger.info("=== Downcity Started ===");

  // 启动 Token 自动轮换定时器
  startTokenRotationTimer(agentRoot);
}

/**
 * 启动 Token 自动轮换定时器。
 *
 * 关键点（中文）
 * - 每 6 小时检查一次 token 是否需要轮换
 * - 如果 token 即将过期（< 1 天），自动创建新 token
 * - 轮换后更新进程环境变量 DC_AGENT_TOKEN
 */
function startTokenRotationTimer(agentRoot: string): void {
  const checkAndRotate = (): void => {
    try {
      const result = rotateAgentTokenIfNeeded(agentRoot);
      if (result?.rotated) {
        // 更新进程环境变量，后续 shell 子进程会使用新 token
        applyInternalAgentAuthEnv({
          targetEnv: process.env,
          sourceEnv: process.env,
          token: result.token,
        });
        logger.info(`Agent token rotated, new token expires at ${result.expiresAt}`);
      }
    } catch (error) {
      logger.error(`Token rotation check failed: ${String(error)}`);
    }
  };

  // 立即执行一次检查
  checkAndRotate();

  // 设置定时器
  const timer = setInterval(checkAndRotate, TOKEN_ROTATION_CHECK_INTERVAL_MS);

  // 确保 timer 不会阻止进程退出
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
