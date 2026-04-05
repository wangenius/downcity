/**
 * Console Plugin 路由。
 *
 * 关键点（中文）
 * - Console 的 plugin 面板首先展示“已注册的内建 plugin 清单”，不应因为 agent 短暂不可用而整块消失。
 * - 当目标 agent 可访问时，再叠加 plugin list + availability，补齐启用态、依赖缺失等动态信息。
 * - 这样能同时满足“架构上 plugin 属于 main/package 注册信息”和“可用性属于 agent 状态”两层语义。
 */

import type { Hono } from "hono";
import {
  findBuiltinPlugin,
  listStaticPluginViews,
} from "@/main/plugin/Catalog.js";
import { isPluginEnabled } from "@/main/plugin/Activation.js";
import { setCityPluginEnabled } from "@/main/plugin/Lifecycle.js";
import type { ConsoleAgentOption } from "@/shared/types/Console.js";
import type {
  PluginActionResult,
  PluginAvailability,
  PluginSetupDefinition,
  PluginView,
} from "@/shared/types/Plugin.js";
import type { JsonValue } from "@/shared/types/Json.js";

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

type RuntimeForwardAuthHeaders = {
  authorization?: string;
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

function buildGlobalPluginActionConfig(
  plugin: ReturnType<typeof findBuiltinPlugin>,
): PluginActionConfigItem[] {
  return buildPluginActionConfig(plugin).filter((item) =>
    item.name === "on" || item.name === "off",
  );
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

function buildGlobalPluginConfigMap(): Map<string, { actions: PluginActionConfigItem[] }> {
  return new Map(
    listStaticPluginViews().map((view) => [
      view.name,
      {
        actions: buildGlobalPluginActionConfig(findBuiltinPlugin(view.name)),
      },
    ] as const),
  );
}

function buildGlobalPluginPayload(): PluginUiResponse {
  const configMap = buildGlobalPluginConfigMap();
  return {
    success: true,
    runtimeConnected: false,
    plugins: listStaticPluginViews().map((view) => ({
      ...view,
      availability: {
        enabled: isPluginEnabled({
          plugin: findBuiltinPlugin(view.name) || {
            name: view.name,
            title: view.title,
            description: view.description,
            actions: {},
          },
        }),
        available: true,
        reasons: [],
      },
      config: {
        actions: configMap.get(view.name)?.actions || [],
      },
    })),
  };
}

function buildAgentPluginPayload(params?: {
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
      availability: {
        enabled: isPluginEnabled({
          plugin: findBuiltinPlugin(view.name) || {
            name: view.name,
            title: view.title,
            description: view.description,
            actions: {},
          },
        }),
        available: false,
        reasons: reason
          ? [`Agent server unavailable: ${reason}`]
          : ["Static catalog view only. Agent-side availability is not loaded."],
      },
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

function readRuntimeForwardAuthHeaders(request: Request): RuntimeForwardAuthHeaders {
  const authorization = String(request.headers.get("authorization") || "").trim();
  return authorization ? { authorization } : {};
}

function buildRuntimeRequestHeaders(params?: {
  authHeaders?: RuntimeForwardAuthHeaders;
  headers?: Headers | Record<string, string>;
}): Headers {
  const headers = new Headers(params?.headers || {});
  const authorization = String(params?.authHeaders?.authorization || "").trim();
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return headers;
}

async function loadPluginViews(
  baseUrl: string,
  authHeaders?: RuntimeForwardAuthHeaders,
): Promise<PluginView[]> {
  const listUrl = new URL("/api/plugins/list", baseUrl).toString();
  const payload = await fetchJson<PluginListResponse>(listUrl, {
    headers: buildRuntimeRequestHeaders({ authHeaders }),
  });
  const plugins = Array.isArray(payload.plugins) ? payload.plugins : [];
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadRuntimePluginAvailability(
  baseUrl: string,
  pluginName: string,
  authHeaders?: RuntimeForwardAuthHeaders,
): Promise<PluginAvailability> {
  const availabilityUrl = new URL("/api/plugins/availability", baseUrl).toString();
  const payload = await fetchJson<PluginAvailabilityResponse>(availabilityUrl, {
    method: "POST",
    headers: buildRuntimeRequestHeaders({
      authHeaders,
      headers: {
        "content-type": "application/json",
      },
    }),
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
  selectedAgent: ConsoleAgentOption,
  authHeaders?: RuntimeForwardAuthHeaders,
): Promise<PluginUiResponse> {
  const baseUrl = String(selectedAgent.baseUrl || "").trim();
  const configMap = buildPluginConfigMap();
  const pluginViews = await loadPluginViews(baseUrl, authHeaders);
  const plugins = await Promise.all(
    pluginViews.map(async (view) => {
      return {
        ...view,
        availability: await loadRuntimePluginAvailability(
          baseUrl,
          view.name,
          authHeaders,
        ),
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

function runGlobalPluginAction(input: {
  pluginName: string;
  actionName: string;
}): PluginActionResult<JsonValue> {
  const pluginName = String(input.pluginName || "").trim();
  const actionName = String(input.actionName || "").trim();
  const plugin = findBuiltinPlugin(pluginName);
  if (!plugin) {
    return {
      success: false,
      error: `Unknown plugin: ${pluginName}`,
      message: `Unknown plugin: ${pluginName}`,
    };
  }
  if (actionName !== "on" && actionName !== "off") {
    return {
      success: false,
      error: `Unsupported global plugin action: ${actionName}`,
      message: `Unsupported global plugin action: ${actionName}`,
    };
  }

  if (plugin.name === "auth") {
    return {
      success: false,
      error: `Plugin "${plugin.name}" cannot be disabled globally`,
      message: `Plugin "${plugin.name}" cannot be disabled globally`,
    };
  }

  setCityPluginEnabled(plugin.name, actionName === "on");
  return {
    success: true,
    message: `Plugin "${plugin.name}" ${actionName === "on" ? "enabled" : "disabled"} in city config`,
    data: {
      pluginName: plugin.name,
      enabled: actionName === "on",
    },
  };
}

/**
 * 注册 Plugin 管理 API 路由。
 */
export function registerConsolePluginRoutes(params: {
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
  ) => Promise<ConsoleAgentOption | null>;
}): void {
  const app = params.app;

  app.get("/api/ui/plugins", async (c) => {
    try {
      const requestedAgentId = params.readRequestedAgentId(c.req.raw);
      if (!requestedAgentId) {
        return c.json(buildGlobalPluginPayload());
      }
      const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
      if (!selectedAgent || !selectedAgent.baseUrl) {
        return c.json(
          buildAgentPluginPayload({
            projectRoot: selectedAgent?.projectRoot,
            runtimeConnected: false,
            runtimeError: "No running agent selected.",
          }),
        );
      }

      try {
        return c.json(
          await buildRuntimePluginPayload(
            selectedAgent,
            readRuntimeForwardAuthHeaders(c.req.raw),
          ),
        );
      } catch (runtimeError) {
        return c.json(
          buildAgentPluginPayload({
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

  app.post("/api/ui/plugins/action", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const pluginName = String(body?.pluginName || "").trim();
      const actionName = String(body?.actionName || "").trim();

      if (!pluginName) {
        return c.json({ success: false, error: "pluginName is required" }, 400);
      }
      if (!actionName) {
        return c.json({ success: false, error: "actionName is required" }, 400);
      }

      const result = runGlobalPluginAction({
        pluginName,
        actionName,
      });
      return c.json(
        {
          ...result,
          pluginName,
          actionName,
        },
        result.success ? 200 : 400,
      );
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
