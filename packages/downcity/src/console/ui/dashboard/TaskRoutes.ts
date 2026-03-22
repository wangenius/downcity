/**
 * Dashboard 任务与日志路由。
 *
 * 关键点（中文）
 * - 聚合 tasks/runs/logs 相关接口。
 * - 任务动作统一复用 task service command，不在 UI 层重复实现业务语义。
 */

import fs from "fs-extra";
import { join } from "path";
import { getShipTasksDirPath } from "@/console/env/Paths.js";
import { runServiceCommand } from "@/console/service/Manager.js";
import { listTaskDefinitions } from "@services/task/Action.js";
import { resolveTaskIdByTitle } from "@services/task/runtime/Store.js";
import type { DashboardRouteRegistrationParams } from "@/types/DashboardRoutes.js";
import {
  TASK_RUN_DIR_REGEX,
  decodeMaybe,
  listTaskRuns,
  readRecentLogs,
  readTaskRunDetail,
  toLimit,
  toOptionalString,
} from "./Helpers.js";

/**
 * 注册任务与日志路由。
 */
export function registerDashboardTaskRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/tasks", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const status = toOptionalString(c.req.query("status"));
      const result = await listTaskDefinitions({
        projectRoot: runtime.rootPath,
        ...(status ? { status: status as "enabled" | "paused" | "disabled" } : {}),
      });
      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      return c.json({
        success: true,
        tasks,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/tasks/run", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        title?: string;
        reason?: string;
      };
      const title = String(body.title || "").trim();
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }

      const reason = toOptionalString(body.reason);
      const result = await runServiceCommand({
        serviceName: "task",
        command: "run",
        payload: {
          title,
          ...(reason ? { reason } : {}),
        },
        context: params.getServiceRuntimeState(),
      });
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/tasks/:title/status", async (c) => {
    try {
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      const body = (await c.req.json().catch(() => ({}))) as {
        status?: string;
      };
      const status = String(body.status || "").trim();
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }
      if (!["enabled", "paused", "disabled"].includes(status)) {
        return c.json({ success: false, error: "Invalid status" }, 400);
      }

      const result = await runServiceCommand({
        serviceName: "task",
        command: "status",
        payload: {
          title,
          status,
        },
        context: params.getServiceRuntimeState(),
      });
      if (!result.success) {
        return c.json(
          { success: false, error: result.message || "task status update failed" },
          400,
        );
      }
      const data =
        result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? result.data
          : {};
      return c.json({
        success: true,
        ...data,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title", async (c) => {
    try {
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }

      const result = await runServiceCommand({
        serviceName: "task",
        command: "delete",
        payload: {
          title,
        },
        context: params.getServiceRuntimeState(),
      });
      if (!result.success) {
        return c.json({ success: false, error: result.message || "task delete failed" }, 400);
      }
      const data =
        result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? result.data
          : {};
      return c.json({
        success: true,
        ...data,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title/runs/:timestamp", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }

      let taskId = "";
      try {
        taskId = await resolveTaskIdByTitle({
          projectRoot: runtime.rootPath,
          title,
        });
      } catch {
        return c.json({ success: false, error: "Task not found" }, 404);
      }
      const runDir = join(getShipTasksDirPath(runtime.rootPath), taskId, timestamp);
      if (!(await fs.pathExists(runDir))) {
        return c.json({ success: false, error: "Run not found" }, 404);
      }

      const progressPath = join(runDir, "run-progress.json");
      const progress = (await fs.readJson(progressPath).catch(() => null)) as {
        status?: string;
      } | null;
      if (String(progress?.status || "").trim().toLowerCase() === "running") {
        return c.json(
          { success: false, error: "Run is still in progress and cannot be deleted" },
          409,
        );
      }

      await fs.remove(runDir);
      return c.json({
        success: true,
        title,
        timestamp,
        deleted: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title/runs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }

      let taskId = "";
      try {
        taskId = await resolveTaskIdByTitle({
          projectRoot: runtime.rootPath,
          title,
        });
      } catch {
        return c.json({ success: false, error: "Task not found" }, 404);
      }

      const taskDir = join(getShipTasksDirPath(runtime.rootPath), taskId);
      if (!(await fs.pathExists(taskDir))) {
        return c.json({
          success: true,
          title,
          deletedCount: 0,
          skippedRunningCount: 0,
          deletedTimestamps: [],
          skippedRunningTimestamps: [],
        });
      }

      const entries = await fs.readdir(taskDir, { withFileTypes: true });
      const timestamps = entries
        .filter((x) => x.isDirectory() && TASK_RUN_DIR_REGEX.test(x.name))
        .map((x) => x.name)
        .sort();
      const deletedTimestamps: string[] = [];
      const skippedRunningTimestamps: string[] = [];

      for (const timestamp of timestamps) {
        const runDir = join(taskDir, timestamp);
        const progressPath = join(runDir, "run-progress.json");
        const progress = (await fs.readJson(progressPath).catch(() => null)) as {
          status?: string;
        } | null;
        if (String(progress?.status || "").trim().toLowerCase() === "running") {
          skippedRunningTimestamps.push(timestamp);
          continue;
        }
        await fs.remove(runDir);
        deletedTimestamps.push(timestamp);
      }

      return c.json({
        success: true,
        title,
        deletedCount: deletedTimestamps.length,
        skippedRunningCount: skippedRunningTimestamps.length,
        deletedTimestamps,
        skippedRunningTimestamps,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/tasks/:title/runs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }

      const limit = toLimit(c.req.query("limit"), 50);
      const runs = await listTaskRuns({
        projectRoot: runtime.rootPath,
        title,
        limit,
      });
      return c.json({ success: true, title, runs });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/tasks/:title/runs/:timestamp", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(String(c.req.param("title") || "").trim());
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!title) {
        return c.json({ success: false, error: "Invalid title" }, 400);
      }
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }

      const detail = await readTaskRunDetail({
        projectRoot: runtime.rootPath,
        title,
        timestamp,
      });
      if (!detail) {
        return c.json({ success: false, error: "Run not found" }, 404);
      }
      return c.json({ success: true, ...detail });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/logs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 200);
      const logs = await readRecentLogs({
        projectRoot: runtime.rootPath,
        limit,
      });
      return c.json({
        success: true,
        logs,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
