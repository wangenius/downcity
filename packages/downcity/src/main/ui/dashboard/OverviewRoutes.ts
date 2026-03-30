/**
 * Dashboard 概览路由。
 *
 * 关键点（中文）
 * - 聚合 overview 与 services 两块轻量只读接口。
 * - 只负责路由层拼装，不承载复杂业务状态机。
 */

import fs from "fs-extra";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { listServiceRuntimes } from "@/main/service/Manager.js";
import { listTaskDefinitions } from "@services/task/Action.js";
import { listSessionSummaries, readRecentLogs, toLimit } from "./Helpers.js";
import type { DashboardRouteRegistrationParams } from "@/types/DashboardRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 当前 DC 版本号（用于 Overview 显示）。
 */
const DC_VERSION = (() => {
  try {
    const pkg = fs.readJsonSync(join(__dirname, "../../../../package.json")) as {
      version?: string;
    };
    const version = String(pkg?.version || "").trim();
    return version || "unknown";
  } catch {
    return "unknown";
  }
})();

/**
 * 注册概览与服务路由。
 */
export function registerDashboardOverviewRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/overview", async (c) => {
    try {
      const runtime = params.getAgentRuntime();
      const sessionLimit = toLimit(
        c.req.query("sessionLimit") || c.req.query("contextLimit"),
        20,
      );
      const sessions = await listSessionSummaries({
        projectRoot: runtime.rootPath,
        executionRuntime: params.getExecutionRuntime(),
        limit: sessionLimit,
      });
      const services = listServiceRuntimes();
      const taskResult = await listTaskDefinitions({
        projectRoot: runtime.rootPath,
      });
      const tasks = Array.isArray(taskResult.tasks) ? taskResult.tasks : [];
      const logs = await readRecentLogs({
        projectRoot: runtime.rootPath,
        limit: 50,
      });

      const statusCount = {
        enabled: tasks.filter((x) => x.status === "enabled").length,
        paused: tasks.filter((x) => x.status === "paused").length,
        disabled: tasks.filter((x) => x.status === "disabled").length,
      };

      return c.json({
        success: true,
        cityVersion: DC_VERSION,
        now: new Date().toISOString(),
        agent: {
          name: runtime.config.name,
          status: "running",
        },
        sessions: {
          total: sessions.length,
          items: sessions,
        },
        services,
        tasks: {
          total: tasks.length,
          statusCount,
        },
        logs,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/services", (c) => {
    return c.json({
      success: true,
      services: listServiceRuntimes(),
    });
  });
}
