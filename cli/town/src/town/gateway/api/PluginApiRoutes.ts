/**
 * 平台 Plugin 路由。
 *
 * 关键点（中文）
 * - 平台控制面的 plugin 面板首先展示“已注册的内建 plugin 清单”，不应因为 agent 短暂不可用而整块消失。
 * - 当目标 agent 可访问时，再叠加 plugin list + availability，补齐启用态、依赖缺失等动态信息。
 * - Town 只展示 catalog 并转发显式 action；plugin 运行态归属于具体 agent。
 */

import type { Hono } from "hono";
import {
  findPluginByName,
  listPluginViews,
  parseActionScheduleRunAtMsOrThrow,
  runLocalPluginAction,
} from "@downcity/agent";
import {
  CHAT_AUTHORIZATION_PLUGIN_NAME,
  createBuiltinPlugins,
} from "@downcity/plugins";
import type { PlatformAgentOption } from "@downcity/agent";
import type {
  PluginActionResult,
  PluginAction,
  PluginAvailability,
  Plugin,
  PluginStateControlAction,
  PluginSetupDefinition,
  PluginUsageDefinition,
  PluginView,
} from "@downcity/agent";
import type { JsonValue } from "@downcity/agent";
import type { AgentRpcPool } from "../AgentRpcPool.js";

type PluginActionConfigItem = {
  name: string;
  supportsCommand: boolean;
  commandDescription: string;
};

type PluginUiItem = PluginView & {
  availability: PluginAvailability;
  config: {
    actions: PluginActionConfigItem[];
    setup?: PluginSetupDefinition;
    usage?: PluginUsageDefinition;
  };
};

type PluginUiResponse = {
  success: boolean;
  plugins: PluginUiItem[];
  runtimeConnected: boolean;
  runtimeError?: string;
};

type JsonRecord = Record<string, unknown>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

function createPluginCatalog() {
  return createBuiltinPlugins();
}

function isVisibleCatalogPlugin(pluginName: string): boolean {
  return pluginName !== CHAT_AUTHORIZATION_PLUGIN_NAME;
}

function createVisiblePluginCatalog() {
  return createPluginCatalog().filter((plugin) => isVisibleCatalogPlugin(plugin.name));
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readCommandSchedule(body: JsonRecord): JsonValue | undefined {
  const nested_schedule = isJsonRecord(body.schedule) ? body.schedule : undefined;
  const top_level_delay = body.delayMs ?? body.delay;
  const top_level_time = body.sendAtMs ?? body.sendAt ?? body.time;
  if (body.schedule !== undefined && !nested_schedule) {
    throw new Error("schedule must be an object");
  }
  if (
    nested_schedule?.runAtMs !== undefined &&
    (top_level_delay !== undefined || top_level_time !== undefined)
  ) {
    throw new Error("`schedule.runAtMs` cannot be used together with `delay/time`.");
  }
  if (nested_schedule?.runAtMs !== undefined) {
    return nested_schedule as JsonValue;
  }
  const run_at_ms = parseActionScheduleRunAtMsOrThrow({
    delay: top_level_delay as string | number | undefined,
    time: top_level_time as string | number | undefined,
  });
  return typeof run_at_ms === "number" ? { runAtMs: run_at_ms } : undefined;
}

function buildPluginActionConfig(
  plugin: Plugin | null,
): PluginActionConfigItem[] {
  if (!plugin) return [];
  const actions = (plugin.actions || {}) as Record<string, PluginAction>;
  return Object.entries(actions)
    .map(([actionName, action]) => ({
      name: actionName,
      supportsCommand: Boolean(action?.command),
      commandDescription: String(action?.command?.description || "").trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildPluginConfigMap(): Map<string, {
  actions: PluginActionConfigItem[];
  setup?: PluginSetupDefinition;
  usage?: PluginUsageDefinition;
}> {
  const plugins = createVisiblePluginCatalog();
  return new Map(
    listPluginViews(plugins).map((view) => {
      const plugin = findPluginByName(plugins, view.name);
      return [
        view.name,
        {
          actions: buildPluginActionConfig(plugin),
          ...(plugin?.setup ? { setup: plugin.setup } : {}),
          ...(plugin?.usage ? { usage: plugin.usage } : {}),
        },
      ] as const;
    }),
  );
}

function buildGlobalPluginConfigMap(): Map<string, {
  actions: PluginActionConfigItem[];
  setup?: PluginSetupDefinition;
}> {
  const plugins = createVisiblePluginCatalog();
  return new Map(
    listPluginViews(plugins).map((view) => {
      const plugin = findPluginByName(plugins, view.name);
      return [
        view.name,
        {
          actions: buildPluginActionConfig(plugin),
          ...(plugin?.setup ? { setup: plugin.setup } : {}),
        },
      ] as const;
    }),
  );
}

function buildGlobalPluginPayload(): PluginUiResponse {
  const configMap = buildGlobalPluginConfigMap();
  return {
    success: true,
    runtimeConnected: false,
    plugins: listPluginViews(createVisiblePluginCatalog()).map((view) => ({
      ...view,
      state: "available",
      availability: {
        enabled: true,
        available: true,
        reasons: [],
      },
      config: configMap.get(view.name) || {
        actions: [],
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
    plugins: listPluginViews(createVisiblePluginCatalog()).map((view) => ({
      ...view,
      state: "available",
      availability: {
        enabled: true,
        available: false,
        reasons: reason
          ? [`Agent runtime unavailable: ${reason}`]
          : ["Static catalog view only. Agent-side availability is not loaded."],
      },
      config: configMap.get(view.name) || {
        actions: [],
      },
    })),
  };
}

async function buildAgentPluginPayloadFromRuntime(
  selectedAgent: PlatformAgentOption,
  agentRpcPool: AgentRpcPool,
): Promise<PluginUiResponse> {
  const client = agentRpcPool.resolveClientForAgent(selectedAgent);
  if (!client) {
    throw new Error("Selected agent RPC endpoint is unavailable.");
  }
  const configMap = buildPluginConfigMap();
  const pluginViews = (await client.list_internal_plugin_catalog())
    .filter((view) => isVisibleCatalogPlugin(view.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const plugins = await Promise.all(
    pluginViews.map(async (view) => {
      return {
        ...view,
        availability: await client.get_internal_plugin_availability(view.name),
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

async function runGlobalPluginAction(input: {
  pluginName: string;
  actionName: string;
  projectRoot?: string;
  payload?: JsonValue;
}): Promise<PluginActionResult<JsonValue>> {
  const pluginName = String(input.pluginName || "").trim();
  const actionName = String(input.actionName || "").trim();
  const plugins = createPluginCatalog();
  const plugin = findPluginByName(plugins, pluginName);
  if (!plugin) {
    return {
      success: false,
      error: `Unknown plugin: ${pluginName}`,
      message: `Unknown plugin: ${pluginName}`,
    };
  }
  if (actionName === "on" || actionName === "off") {
    return {
      success: false,
      error: `Plugin "${plugin.name}" ${actionName} requires a selected agent`,
      message: `Plugin "${plugin.name}" ${actionName} requires a selected agent`,
    };
  }

  const projectRoot = String(input.projectRoot || "").trim();
  if (!projectRoot) {
    return {
      success: false,
      error: `Plugin "${plugin.name}" action "${actionName}" requires a selected agent`,
      message: `Plugin "${plugin.name}" action "${actionName}" requires a selected agent`,
    };
  }

  return runLocalPluginAction({
    plugins,
    projectRoot,
    pluginName: plugin.name,
    actionName,
    payload: input.payload,
  });
}

/**
 * Plugin 管理 API 路由参数。
 */
export interface PlatformPluginRouteParams {
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
  ) => Promise<PlatformAgentOption | null>;
  /**
   * Town 维护的 Agent RPC 连接池。
   */
  agentRpcPool: AgentRpcPool;
}

/**
 * Agent runtime plugin RPC client。
 */
type RuntimePluginRpcClient = NonNullable<
  ReturnType<AgentRpcPool["resolveClientForAgent"]>
>;

/**
 * 解析选中 agent 的 plugin RPC client。
 */
async function resolveRuntimePluginRpcClient(
  params: PlatformPluginRouteParams,
  request: Request,
): Promise<
  | { client: RuntimePluginRpcClient }
  | { response: Response }
> {
  const requested_agent_id = params.readRequestedAgentId(request);
  const selected_agent = await params.resolveSelectedAgent(requested_agent_id);
  if (!selected_agent || selected_agent.running !== true) {
    return {
      response: new Response(
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
      ),
    };
  }

  const client = params.agentRpcPool.resolveClientForAgent(selected_agent);
  if (!client) {
    return {
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Selected agent RPC endpoint is unavailable.",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    };
  }

  return { client };
}

/**
 * 注册 Plugin 管理 API 路由。
 */
export function registerPlatformPluginRoutes(
  params: PlatformPluginRouteParams,
): void {
  const app = params.app;

  app.get("/api/ui/plugins", async (c) => {
    try {
      const requestedAgentId = params.readRequestedAgentId(c.req.raw);
      if (!requestedAgentId) {
        return c.json(buildGlobalPluginPayload());
      }
      const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
      if (!selectedAgent || !selectedAgent.running) {
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
          await buildAgentPluginPayloadFromRuntime(
            selectedAgent,
            params.agentRpcPool,
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

      const requestedAgentId = params.readRequestedAgentId(c.req.raw);
      const selectedAgent = requestedAgentId
        ? await params.resolveSelectedAgent(requestedAgentId)
        : null;

      const client = selectedAgent?.running === true
        ? params.agentRpcPool.resolveClientForAgent(selectedAgent)
        : null;
      const result = client
        ? await client.run_internal_plugin_action({
            plugin_name: pluginName,
            action_name: actionName,
            payload: body?.payload,
          })
        : await runGlobalPluginAction({
            pluginName,
            actionName,
            projectRoot: String(selectedAgent?.projectRoot || "").trim() || undefined,
            payload: body?.payload,
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

  app.get("/api/plugins/catalog", async (c) => {
    try {
      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      return c.json({
        success: true,
        plugins: await resolved.client.list_internal_plugin_catalog(),
      });
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

  app.get("/api/plugins/list", async (c) => {
    try {
      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      return c.json({
        success: true,
        plugins: await resolved.client.list_internal_plugin_states(),
      });
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

  app.post("/api/plugins/availability", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const plugin_name = String(body?.pluginName || "").trim();
      if (!plugin_name) {
        return c.json({ success: false, error: "pluginName is required" }, 400);
      }

      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      return c.json({
        success: true,
        pluginName: plugin_name,
        availability: await resolved.client.get_internal_plugin_availability(
          plugin_name,
        ),
      });
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

  app.post("/api/plugins/control", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const plugin_name = String(body?.pluginName || "").trim();
      const action = String(body?.action || "")
        .trim()
        .toLowerCase();

      if (!plugin_name) {
        return c.json({ success: false, error: "pluginName is required" }, 400);
      }
      if (!action) {
        return c.json({ success: false, error: "action is required" }, 400);
      }
      if (!["start", "stop", "restart", "status"].includes(action)) {
        return c.json({ success: false, error: "invalid action" }, 400);
      }

      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      const result = await resolved.client.control_internal_plugin({
        plugin_name,
        action: action as PluginStateControlAction,
      });
      return c.json(result, result.success ? 200 : 400);
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

  app.post("/api/plugins/command", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const command_body = isJsonRecord(body) ? body : {};
      const plugin_name = String(command_body.pluginName || "").trim();
      const command = String(command_body.command || "").trim();

      if (!plugin_name) {
        return c.json({ success: false, error: "pluginName is required" }, 400);
      }
      if (!command) {
        return c.json({ success: false, error: "command is required" }, 400);
      }

      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      // 关键点（中文）：读取 command 调度字段，再交给 Agent RPC 执行。
      const schedule = readCommandSchedule(command_body);
      const result = await resolved.client.run_internal_plugin_command({
        plugin_name,
        command,
        payload: command_body.payload as JsonValue | undefined,
        schedule,
      });
      return c.json(result, result.success ? 200 : 400);
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

  app.post("/api/plugins/action", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const plugin_name = String(body?.pluginName || "").trim();
      const action_name = String(body?.actionName || "").trim();

      if (!plugin_name) {
        return c.json({ success: false, error: "pluginName is required" }, 400);
      }
      if (!action_name) {
        return c.json({ success: false, error: "actionName is required" }, 400);
      }

      const resolved = await resolveRuntimePluginRpcClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;

      // 关键点（中文）：这里承接旧 `/api/plugins/action`，但通过 Agent RPC 执行，不再代理到 Agent HTTP。
      const result = await resolved.client.run_internal_plugin_action({
        plugin_name,
        action_name,
        payload: body?.payload,
      });

      return c.json(
        {
          ...result,
          pluginName: plugin_name,
          actionName: action_name,
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
