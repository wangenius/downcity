/**
 * Console UI Plugin 路由。
 *
 * 关键点（中文）
 * - Console UI 的 plugin 面板首先展示“已注册的内建 plugin 清单”，不应因为 agent 短暂不可用而整块消失。
 * - 当目标 agent 可访问时，再叠加 plugin list + availability，补齐启用态、依赖缺失等动态信息。
 * - 这样能同时满足“架构上 plugin 属于 main/package 注册信息”和“可用性属于 agent 状态”两层语义。
 */

import type { Hono } from "hono";
import {
  buildStaticPluginAvailability,
  findBuiltinPlugin,
  listStaticPluginViews,
} from "@/main/plugin/Catalog.js";
import type { ConsoleUiAgentOption } from "@/types/ConsoleUI.js";
import type {
  PluginAvailability,
  PluginSetupDefinition,
  PluginView,
} from "@/types/Plugin.js";

type PluginActionConfigItem = {
  name: string;
  supportsCommand: boolean;
  supportsApi: boolean;
  commandDescription: string;
  apiMethod: string;
  apiPath: string;
};

type PluginUiItem = PluginView & {
  availability: PluginAvailability;
  config: {
    actions: PluginActionConfigItem[];
    setup?: PluginSetupDefinition;
  };
};

type PluginUiResponse = {
  success: boolean;
  plugins: PluginUiItem[];
  runtimeConnected: boolean;
  runtimeError?: string;
};

type PluginListResponse = {
  success?: boolean;
  plugins?: PluginView[];
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

function buildPluginActionConfig(
  plugin: ReturnType<typeof findBuiltinPlugin>,
): PluginActionConfigItem[] {
  if (!plugin) return [];
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

function buildPluginConfigMap(): Map<string, { actions: PluginActionConfigItem[]; setup?: PluginSetupDefinition }> {
  return new Map(
    listStaticPluginViews().map((view) => [
      view.name,
      {
        actions: buildPluginActionConfig(findBuiltinPlugin(view.name)),
        ...(findBuiltinPlugin(view.name)?.setup
          ? { setup: findBuiltinPlugin(view.name)?.setup }
          : {}),
      },
    ] as const),
  );
}

function buildStaticPluginPayload(params?: {
  projectRoot?: string;
  runtimeError?: string;
  runtimeConnected?: boolean;
}): PluginUiResponse {
  const configMap = buildPluginConfigMap();
  const reason = String(params?.runtimeError || "").trim();
  return {
    success: true,
    runtimeConnected: params?.runtimeConnected === true,
    ...(reason ? { runtimeError: reason } : {}),
    plugins: listStaticPluginViews().map((view) => ({
      ...view,
      availability: buildStaticPluginAvailability({
        pluginName: view.name,
        projectRoot: params?.projectRoot,
        agentError: reason,
      }),
      config: configMap.get(view.name) || {
        actions: [],
      },
    })),
  };
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

async function loadPluginViews(baseUrl: string): Promise<PluginView[]> {
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

async function buildRuntimePluginPayload(
  selectedAgent: ConsoleUiAgentOption,
): Promise<PluginUiResponse> {
  const baseUrl = String(selectedAgent.baseUrl || "").trim();
  const configMap = buildPluginConfigMap();
  const pluginViews = await loadPluginViews(baseUrl);
  const plugins = await Promise.all(
    pluginViews.map(async (view) => {
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
    runtimeConnected: true,
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
          buildStaticPluginPayload({
            projectRoot: selectedAgent?.projectRoot,
            runtimeConnected: false,
            runtimeError: "No running agent selected.",
          }),
        );
      }

      try {
        return c.json(await buildRuntimePluginPayload(selectedAgent));
      } catch (runtimeError) {
        return c.json(
          buildStaticPluginPayload({
            projectRoot: selectedAgent.projectRoot,
            runtimeConnected: false,
            runtimeError: getErrorMessage(runtimeError),
          }),
        );
      }
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
