/**
 * Console dashboard task/logs 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 `/api/dashboard/tasks*` 与 `/api/dashboard/logs` 路径。
 * - 业务动作通过 Town 维护的 Agent RPC 连接执行，不再经由 Agent HTTP control API。
 * - run/log 详情仍读取 agent 项目本地 `.downcity` 运行目录，保持 UI 数据结构稳定。
 */

import type { Hono } from "hono";
import fs from "fs-extra";
import path from "node:path";
import type { PlatformAgentOption } from "@downcity/agent";
import {
  TASK_RUN_DIR_REGEX,
  listTaskRuns,
  readRecentLogs,
  readTaskRunDetail,
} from "@downcity/agent/internal/runtime/control/TaskStore.js";
import type { AgentRpcPool } from "@/control/gateway/AgentRpcPool.js";
import { getDowncityDirPath } from "@/config/Paths.js";

const TASK_ID_REGEXP = /^[\p{L}\p{N}][\p{L}\p{N}_\-\s]{0,63}$/u;

/**
 * Dashboard task 路由参数。
 */
export interface DashboardTaskApiRouteParams {
  /**
   * Hono 应用实例。
   */
  app: Hono;
  /**
   * 从请求中读取用户选择的 agent id。
   */
  readRequestedAgentId(request: Request): string;
  /**
   * 解析当前运行中的 agent。
   */
  resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
  /**
   * Town 维护的 Agent RPC 连接池。
   */
  agentRpcPool: AgentRpcPool;
}

/**
 * 注册旧 dashboard task/logs 路由。
 */
export function registerDashboardTaskApiRoutes(
  params: DashboardTaskApiRouteParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/tasks", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const tasks = await listTasksViaRpc(context);
      const enriched = await Promise.all(
        tasks.map(async (task) => {
          const running = await readTaskRunningState({
            project_root: context.agent.projectRoot,
            task,
          });
          return running ? { ...task, running } : task;
        }),
      );
      return c.json({
        success: true,
        tasks: enriched,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/tasks/run", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const body = (await c.req.json().catch(() => ({}))) as {
        title?: unknown;
        reason?: unknown;
      };
      const title = String(body.title || "").trim();
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      const result = await context.client.run_internal_plugin_action({
        plugin_name: "task",
        action_name: "run",
        payload: {
          title,
          ...(typeof body.reason === "string" && body.reason.trim()
            ? { reason: body.reason.trim() }
            : {}),
        },
      });
      return c.json(normalizePluginActionResponse(result), result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/tasks/:title/status", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      const body = (await c.req.json().catch(() => ({}))) as {
        status?: unknown;
      };
      const status = String(body.status || "").trim();
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      if (!["enabled", "paused", "disabled"].includes(status)) {
        return c.json({ success: false, error: "Invalid status" }, 400);
      }
      const result = await context.client.run_internal_plugin_action({
        plugin_name: "task",
        action_name: "status",
        payload: {
          title,
          status,
        },
      });
      return c.json(normalizePluginActionResponse(result), result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/tasks/:title/runs", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      const runs = await listTaskRuns({
        projectRoot: context.agent.projectRoot,
        title,
        limit: toLimit(c.req.query("limit"), 50),
      });
      return c.json({ success: true, title, runs });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title/runs", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      const result = await clearTaskRuns({
        projectRoot: context.agent.projectRoot,
        title,
      });
      return c.json({ success: true, title, ...result });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/tasks/:title/runs/:timestamp", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }
      const detail = await readTaskRunDetail({
        projectRoot: context.agent.projectRoot,
        title,
        timestamp,
      });
      if (!detail) return c.json({ success: false, error: "Run not found" }, 404);
      return c.json({ success: true, ...detail });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title/runs/:timestamp", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }
      const deleted = await deleteTaskRun({
        projectRoot: context.agent.projectRoot,
        title,
        timestamp,
      });
      if (!deleted) return c.json({ success: false, error: "Run not found" }, 404);
      return c.json({ success: true, title, timestamp, deleted: true });
    } catch (error) {
      const message = String(error);
      if (message.includes("Run is still in progress")) {
        return c.json({ success: false, error: message }, 409);
      }
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.delete("/api/dashboard/tasks/:title", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const title = decodeMaybe(c.req.param("title"));
      if (!title) return c.json({ success: false, error: "Invalid title" }, 400);
      const result = await context.client.run_internal_plugin_action({
        plugin_name: "task",
        action_name: "delete",
        payload: {
          title,
        },
      });
      return c.json(normalizePluginActionResponse(result), result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/logs", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const logs = await readRecentLogs({
        projectRoot: context.agent.projectRoot,
        limit: toLimit(c.req.query("limit"), 200),
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

async function resolveDashboardAgentContext(
  params: DashboardTaskApiRouteParams,
  request: Request,
): Promise<{
  agent: PlatformAgentOption;
  client: NonNullable<ReturnType<AgentRpcPool["resolveClientForAgent"]>>;
} | null> {
  const requested_agent_id = params.readRequestedAgentId(request);
  const agent = await params.resolveSelectedAgent(requested_agent_id);
  if (!agent || agent.running !== true) return null;
  const client = params.agentRpcPool.resolveClientForAgent(agent);
  if (!client) return null;
  return {
    agent,
    client,
  };
}

function agentUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "No running agent found. Start one via `town agent start` first.",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function normalizePluginActionResponse(input: {
  success?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}): Record<string, unknown> {
  const data = input.data && typeof input.data === "object" && !Array.isArray(input.data)
    ? input.data as Record<string, unknown>
    : {};
  return {
    success: input.success === true,
    ...data,
    ...(input.message ? { message: input.message } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

type DashboardTaskItem = {
  title?: unknown;
  taskMdPath?: unknown;
  lastRunTimestamp?: unknown;
  [key: string]: unknown;
};

async function listTasksViaRpc(params: {
  agent: PlatformAgentOption;
  client: NonNullable<ReturnType<AgentRpcPool["resolveClientForAgent"]>>;
}): Promise<DashboardTaskItem[]> {
  const payload = await params.client.run_internal_plugin_action({
    plugin_name: "task",
    action_name: "list",
    payload: {},
  });
  if (!payload.success) {
    throw new Error(payload.error || payload.message || "task list failed");
  }
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as { tasks?: unknown }
    : {};
  return Array.isArray(data.tasks) ? data.tasks as DashboardTaskItem[] : [];
}

function getDowncityTasksDirPath(project_root: string): string {
  return path.join(getDowncityDirPath(project_root), "task");
}

function normalizeTaskId(input: string): string {
  const id = String(input || "").trim();
  if (!TASK_ID_REGEXP.test(id)) {
    throw new Error(`Invalid taskId: "${id}"`);
  }
  return id;
}

function deriveTaskIdFromTitle(title: string): string {
  const normalized = String(title || "")
    .normalize("NFKC")
    .replace(/[\\/:\u0000]/g, " ")
    .replace(/[^\p{L}\p{N}_\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .trim();
  return normalizeTaskId(normalized);
}

function resolveTaskIdFromTaskMdPath(task_md_path: unknown): string {
  const text = String(task_md_path || "").trim();
  if (!text) return "";
  return path.basename(path.dirname(text));
}

async function readTaskRunningState(params: {
  project_root: string;
  task: DashboardTaskItem;
}): Promise<boolean> {
  const task_id =
    resolveTaskIdFromTaskMdPath(params.task.taskMdPath) ||
    deriveTaskIdFromTitle(String(params.task.title || ""));
  const timestamp = String(params.task.lastRunTimestamp || "").trim();
  if (!task_id || !timestamp || !TASK_RUN_DIR_REGEX.test(timestamp)) return false;
  const progress_path = path.join(
    getDowncityTasksDirPath(params.project_root),
    task_id,
    timestamp,
    "run-progress.json",
  );
  const progress = (await fs.readJson(progress_path).catch(() => null)) as {
    status?: unknown;
  } | null;
  return String(progress?.status || "").trim().toLowerCase() === "running";
}

async function deleteTaskRun(params: {
  projectRoot: string;
  title: string;
  timestamp: string;
}): Promise<boolean> {
  const task_dir = resolveTaskDir(params.projectRoot, params.title);
  const run_dir = path.join(task_dir, params.timestamp);
  if (!(await fs.pathExists(run_dir))) return false;
  const progress = (await fs.readJson(path.join(run_dir, "run-progress.json")).catch(() => null)) as {
    status?: unknown;
  } | null;
  if (String(progress?.status || "").trim().toLowerCase() === "running") {
    throw new Error("Run is still in progress and cannot be deleted");
  }
  await fs.remove(run_dir);
  return true;
}

async function clearTaskRuns(params: {
  projectRoot: string;
  title: string;
}): Promise<{
  deletedCount: number;
  skippedRunningCount: number;
  deletedTimestamps: string[];
  skippedRunningTimestamps: string[];
}> {
  const task_dir = resolveTaskDir(params.projectRoot, params.title);
  if (!(await fs.pathExists(task_dir))) {
    return {
      deletedCount: 0,
      skippedRunningCount: 0,
      deletedTimestamps: [],
      skippedRunningTimestamps: [],
    };
  }
  const entries = await fs.readdir(task_dir, { withFileTypes: true });
  const timestamps = entries
    .filter((item) => item.isDirectory() && TASK_RUN_DIR_REGEX.test(item.name))
    .map((item) => item.name)
    .sort();
  const deleted_timestamps: string[] = [];
  const skipped_running_timestamps: string[] = [];

  for (const timestamp of timestamps) {
    const run_dir = path.join(task_dir, timestamp);
    const progress = (await fs.readJson(path.join(run_dir, "run-progress.json")).catch(() => null)) as {
      status?: unknown;
    } | null;
    if (String(progress?.status || "").trim().toLowerCase() === "running") {
      skipped_running_timestamps.push(timestamp);
      continue;
    }
    await fs.remove(run_dir);
    deleted_timestamps.push(timestamp);
  }

  return {
    deletedCount: deleted_timestamps.length,
    skippedRunningCount: skipped_running_timestamps.length,
    deletedTimestamps: deleted_timestamps,
    skippedRunningTimestamps: skipped_running_timestamps,
  };
}

function resolveTaskDir(project_root: string, title: string): string {
  const task_id = deriveTaskIdFromTitle(title);
  return path.join(getDowncityTasksDirPath(project_root), task_id);
}

function toLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 500));
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(String(value || "")).trim();
  } catch {
    return String(value || "").trim();
  }
}
