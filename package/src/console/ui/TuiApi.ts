/**
 * TUI API（WebUI 数据面板接口）。
 *
 * 关键点（中文）
 * - 面向内置 Web UI，提供 contexts/services/tasks/logs 的接口。
 * - 本文件只负责路由装配；数据读取与转换逻辑下沉到 `ui/tui/Helpers.ts`。
 */

import type { Hono } from "hono";
import type { SystemModelMessage } from "ai";
import fs from "fs-extra";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  listServiceRuntimes,
  runServiceCommand,
} from "@agent/service/Manager.js";
import type { RuntimeState } from "@/agent/context/manager/RuntimeState.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import { listTaskDefinitions } from "@services/task/Action.js";
import { resolveAgentSystemMessages } from "@agent/prompts/system/SystemDomain.js";
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
import { getShipContextMessagesPath, getShipJsonPath } from "@/console/env/Paths.js";
import { ConsoleStore } from "@utils/store/index.js";

const LOCAL_UI_CONTEXT_ID = "local_ui";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 当前 SMA 版本号（用于 Overview 显示）。
 */
const SMA_VERSION = (() => {
  try {
    const pkg = fs.readJsonSync(join(__dirname, "../../../package.json")) as {
      version?: string;
    };
    const version = String(pkg?.version || "").trim();
    return version || "unknown";
  } catch {
    return "unknown";
  }
})();

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

function toSystemMessageText(message: SystemModelMessage): string {
  const content = message.content as unknown;
  if (typeof content === "string") return normalizeSystemText(content);
  if (!Array.isArray(content)) return "";
  const parts = content as Array<{ text?: unknown }>;
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const text = normalizeSystemText(String(part.text || ""));
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

/**
 * 把 Prompter 直接产出的 system messages 转成 UI 可渲染结构。
 *
 * 关键点（中文）
 * - 只做“展示层映射”，不在 UI 层重建 system 业务规则。
 */
function toSystemPromptPayload(messages: SystemModelMessage[]): {
  sections: Array<{
    key: string;
    title: string;
    items: Array<{ index: number; content: string }>;
  }>;
  totalMessages: number;
  totalChars: number;
} {
  const items = messages
    .map((message, index) => ({
      index: index + 1,
      content: toSystemMessageText(message),
    }))
    .filter((item) => item.content);
  const totalChars = items.reduce(
    (acc, item) => acc + String(item.content || "").length,
    0,
  );
  return {
    sections: [
      {
        key: "resolved",
        title: "Resolved System Messages",
        items,
      },
    ],
    totalMessages: items.length,
    totalChars,
  };
}

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
        smaVersion: SMA_VERSION,
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

  app.get("/api/tui/system-prompt", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId =
        decodeMaybe(String(c.req.query("contextId") || "").trim()) ||
        LOCAL_UI_CONTEXT_ID;
      const systemMessages = await resolveAgentSystemMessages({
        projectRoot: runtime.rootPath,
        contextId,
        requestId: `ui-system-preview-${Date.now()}`,
        profile: "chat",
        staticSystemPrompts: runtime.systems,
        runtime: params.getServiceRuntimeState(),
      });
      return c.json({
        success: true,
        contextId,
        ...toSystemPromptPayload(systemMessages),
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

  app.get("/api/tui/model", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const agentPrimaryModelId = String(runtime.config.model?.primary || "").trim();
      const store = new ConsoleStore();
      const models = store.listModels();
      const providers = await store.listProviders();
      const providerMap = new Map(providers.map((x) => [x.id, x] as const));
      const activeModel = agentPrimaryModelId
        ? models.find((x) => x.id === agentPrimaryModelId)
        : undefined;
      const providerKey = String(activeModel?.providerId || "").trim();
      const provider = providerKey ? providerMap.get(providerKey) : undefined;
      const availableModels = models.map((model) => {
        const providerConfig = providerMap.get(model.providerId);
        return {
          id: model.id,
          name: model.name,
          providerKey: model.providerId,
          providerType: String(providerConfig?.type || "").trim(),
        };
      });
      store.close();

      return c.json({
        success: true,
        model: {
          primaryModelId: agentPrimaryModelId,
          primaryModelName: String(activeModel?.name || "").trim(),
          providerKey,
          providerType: String(provider?.type || "").trim(),
          baseUrl: String(provider?.baseUrl || "").trim(),
          agentPrimaryModelId,
          availableModels,
        },
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/model/switch", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const body = (await c.req.json().catch(() => ({}))) as {
        primaryModelId?: string;
      };
      const nextPrimaryModelId = String(body.primaryModelId || "").trim();
      if (!nextPrimaryModelId) {
        return c.json({ success: false, error: "Missing primaryModelId" }, 400);
      }
      const store = new ConsoleStore();
      const targetModel = store.getModel(nextPrimaryModelId);
      store.close();
      if (!targetModel) {
        return c.json({ success: false, error: `Model not found: ${nextPrimaryModelId}` }, 400);
      }

      const shipJsonPath = getShipJsonPath(runtime.rootPath);
      const agentShip = (await fs.readJson(shipJsonPath)) as {
        model?: { primary?: string };
      };
      if (!agentShip.model || typeof agentShip.model !== "object") {
        agentShip.model = { primary: nextPrimaryModelId };
      } else {
        agentShip.model.primary = nextPrimaryModelId;
      }
      await fs.writeJson(shipJsonPath, agentShip, { spaces: 2 });

      // 关键点（中文）：同步更新当前 runtime 快照；模型实例仍需重启后完整切换。
      if (!runtime.config.model || typeof runtime.config.model !== "object") {
        runtime.config.model = { primary: nextPrimaryModelId };
      } else {
        runtime.config.model.primary = nextPrimaryModelId;
      }

      return c.json({
        success: true,
        primaryModelId: nextPrimaryModelId,
        restartRequired: true,
        message: "Agent primary model updated. Restart agent to fully apply runtime model instance.",
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
      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      return c.json({
        success: true,
        tasks,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/tasks/run", async (c) => {
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

  app.get("/api/tui/tasks/:title/runs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(
        String(c.req.param("title") || "").trim(),
      );
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

  app.get("/api/tui/tasks/:title/runs/:timestamp", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const title = decodeMaybe(
        String(c.req.param("title") || "").trim(),
      );
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
