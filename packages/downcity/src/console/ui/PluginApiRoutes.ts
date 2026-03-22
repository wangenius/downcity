/**
 * Console UI Plugin 路由。
 *
 * 关键点（中文）
 * - UI 网关不直接依赖本地 runtime state，避免多 agent 场景读到未初始化状态。
 * - 插件数据只从“当前选中的 agent runtime”拉取。
 * - 不做旧结构兼容，也不返回静态 fallback 清单。
 */

import type { Hono } from "hono";
import { PLUGINS } from "@/console/plugin/Plugins.js";
import type { ConsoleUiAgentOption } from "@/types/ConsoleUI.js";
import type {
  Plugin,
  PluginAvailability,
  PluginRuntimeView,
} from "@/types/Plugin.js";

type PluginActionConfigItem = {
  name: string;
  supportsCommand: boolean;
  supportsApi: boolean;
  commandDescription: string;
  apiMethod: string;
  apiPath: string;
};

type PluginUiItem = PluginRuntimeView & {
  availability: PluginAvailability;
  config: {
    actions: PluginActionConfigItem[];
  };
};

type PluginListResponse = {
  success?: boolean;
  plugins?: PluginRuntimeView[];
  error?: string;
  message?: string;
};

type PluginAvailabilityResponse = {
  success?: boolean;
  availability?: PluginAvailability;
  error?: string;
  message?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

function buildPluginActionConfig(plugin: Plugin): PluginActionConfigItem[] {
  return Object.entries(plugin.actions || {})
    .map(([actionName, action]) => ({
      name: actionName,
      supportsCommand: Boolean(action?.command),
      supportsApi: Boolean(action?.api),
      commandDescription: String(action?.command?.description || "").trim(),
      apiMethod: String(action?.api?.method || "").trim().toUpperCase(),
      apiPath: String(action?.api?.path || "").trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildPluginConfigMap(): Map<string, { actions: PluginActionConfigItem[] }> {
  return new Map(
    PLUGINS.map((plugin) => [
      plugin.name,
      {
        actions: buildPluginActionConfig(plugin),
      },
    ] as const),
  );
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || payload?.success === false) {
    const errorMessage =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : `${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }
  return payload as T;
}

async function loadRuntimePluginViews(baseUrl: string): Promise<PluginRuntimeView[]> {
  const listUrl = new URL("/api/plugins/list", baseUrl).toString();
  const payload = await fetchJson<PluginListResponse>(listUrl);
  const plugins = Array.isArray(payload.plugins) ? payload.plugins : [];
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadRuntimePluginAvailability(
  baseUrl: string,
  pluginName: string,
): Promise<PluginAvailability> {
  const availabilityUrl = new URL("/api/plugins/availability", baseUrl).toString();
  const payload = await fetchJson<PluginAvailabilityResponse>(availabilityUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      pluginName,
    }),
  });
  if (!payload.availability) {
    throw new Error(`Plugin availability is empty: ${pluginName}`);
  }
  return payload.availability;
}

async function buildRuntimePluginPayload(selectedAgent: ConsoleUiAgentOption): Promise<{
  success: boolean;
  plugins: PluginUiItem[];
}> {
  const baseUrl = String(selectedAgent.baseUrl || "").trim();
  const configMap = buildPluginConfigMap();
  const runtimeViews = await loadRuntimePluginViews(baseUrl);
  const plugins = await Promise.all(
    runtimeViews.map(async (view) => {
      return {
        ...view,
        availability: await loadRuntimePluginAvailability(baseUrl, view.name),
        config: configMap.get(view.name) || {
          actions: [],
        },
      };
    }),
  );
  return {
    success: true,
    plugins,
  };
}

/**
 * 注册 Plugin 管理 API 路由。
 */
export function registerConsoleUiPluginRoutes(params: {
  /**
   * Hono 应用实例。
   */
  app: Hono;
  /**
   * 从请求中读取目标 agent id。
   */
  readRequestedAgentId: (request: Request) => string;
  /**
   * 解析当前应使用的 agent。
   */
  resolveSelectedAgent: (
    requestedAgentId: string,
  ) => Promise<ConsoleUiAgentOption | null>;
}): void {
  const app = params.app;

  app.get("/api/ui/plugins", async (c) => {
    try {
      const requestedAgentId = params.readRequestedAgentId(c.req.raw);
      const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
      if (!selectedAgent || !selectedAgent.baseUrl) {
        return c.json(
          {
            success: false,
            error: "No running agent selected.",
          },
          503,
        );
      }

      return c.json(await buildRuntimePluginPayload(selectedAgent));
    } catch (error) {
      return c.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}
