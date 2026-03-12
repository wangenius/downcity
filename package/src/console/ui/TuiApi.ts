/**
 * TUI API（WebUI 数据面板接口）。
 *
 * 关键点（中文）
 * - 面向内置 Web UI，提供 contexts/services/tasks/logs 的接口。
 * - 本文件只负责路由装配；数据读取与转换逻辑下沉到 `ui/tui/Helpers.ts`。
 */

import type { Hono } from "hono";
import {
  listServiceRuntimes,
  runServiceCommand,
} from "@agent/service/Manager.js";
import type { RuntimeState } from "@/agent/context/manager/RuntimeState.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import { listTaskDefinitions } from "@services/task/Action.js";
import { isValidTaskId } from "@services/task/runtime/Paths.js";
import {
  TASK_RUN_DIR_REGEX,
  decodeMaybe,
  executeByContextId,
  listContextSummaries,
  listTaskRuns,
  loadContextMessagesFromFile,
  readRecentLogs,
  readTaskRunDetail,
  toLimit,
  toOptionalString,
  toUiMessageTimeline,
} from "./tui/Helpers.js";
import { getShipContextMessagesPath } from "@/console/env/Paths.js";

export function registerTuiApiRoutes(params: {
  app: Hono;
  getRuntimeState: () => RuntimeState;
  getServiceRuntimeState: () => ServiceRuntime;
}): void {
  const app = params.app;

  app.get("/api/tui/overview", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextLimit = toLimit(c.req.query("contextLimit"), 20);
      const contexts = await listContextSummaries({
        projectRoot: runtime.rootPath,
        limit: contextLimit,
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
        now: new Date().toISOString(),
        agent: {
          name: runtime.config.name,
          status: "running",
        },
        contexts: {
          total: contexts.length,
          items: contexts,
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

  app.get("/api/tui/services", (c) => {
    return c.json({
      success: true,
      services: listServiceRuntimes(),
    });
  });

  app.get("/api/tui/contexts", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"));
      const contexts = await listContextSummaries({
        projectRoot: runtime.rootPath,
        limit,
      });
      return c.json({
        success: true,
        contexts,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/contexts/:contextId/messages", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 200);
      const contextId = decodeMaybe(
        String(c.req.param("contextId") || "").trim(),
      );
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const filePath = getShipContextMessagesPath(runtime.rootPath, contextId);
      const messages = await loadContextMessagesFromFile(filePath);
      const sliced = messages
        .slice(-limit)
        .flatMap((message) => toUiMessageTimeline(message));
      return c.json({
        success: true,
        contextId,
        total: sliced.length,
        rawTotal: messages.length,
        messages: sliced,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/contexts/:contextId/execute", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(
        String(c.req.param("contextId") || "").trim(),
      );
      const body = (await c.req.json().catch(() => ({}))) as {
        instructions?: string;
      };
      const instructions = String(body.instructions || "").trim();
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }
      if (!instructions) {
        return c.json({ success: false, error: "Missing instructions" }, 400);
      }

      const result = await executeByContextId({
        runtime,
        contextId,
        instructions,
      });
      return c.json({
        success: true,
        contextId,
        result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const status = toOptionalString(c.req.query("status"));
      const result = await listTaskDefinitions({
        projectRoot: runtime.rootPath,
        ...(status
          ? { status: status as "enabled" | "paused" | "disabled" }
          : {}),
      });
      return c.json({
        success: true,
        tasks: Array.isArray(result.tasks) ? result.tasks : [],
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/tasks/run", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        taskId?: string;
        reason?: string;
      };
      const taskId = String(body.taskId || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }

      const reason = toOptionalString(body.reason);
      const result = await runServiceCommand({
        serviceName: "task",
        command: "run",
        payload: {
          taskId,
          ...(reason ? { reason } : {}),
        },
        context: params.getServiceRuntimeState(),
      });
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks/:taskId/runs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const taskId = String(c.req.param("taskId") || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }

      const limit = toLimit(c.req.query("limit"), 50);
      const runs = await listTaskRuns({
        projectRoot: runtime.rootPath,
        taskId,
        limit,
      });
      return c.json({ success: true, taskId, runs });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks/:taskId/runs/:timestamp", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const taskId = String(c.req.param("taskId") || "").trim();
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }

      const detail = await readTaskRunDetail({
        projectRoot: runtime.rootPath,
        taskId,
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

  app.get("/api/tui/logs", async (c) => {
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
