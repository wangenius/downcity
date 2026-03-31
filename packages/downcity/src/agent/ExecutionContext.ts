import type {
  ExecutionContext,
  InvokeServicePort,
  SessionPort,
} from "@/types/ExecutionContext.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginView,
} from "@/types/Plugin.js";
import type { AgentState } from "@/types/AgentState.js";
import { runServiceCommand } from "@/main/service/Manager.js";
import { isPluginEnabledInConfig } from "@/main/plugin/Activation.js";
import { HookRegistry } from "@/main/plugin/HookRegistry.js";
import { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/main/plugin/Plugins.js";
import {
  getAgentState,
  requireAgentModel,
} from "@agent/RuntimeState.js";

/**
 * ExecutionContext 构造模块。
 *
 * 关键点（中文）
 * - 这里负责从 `AgentState` 派生统一执行上下文。
 * - `ExecutionContext` 表达的是执行时能力面，而不是宿主本体。
 * - plugin registry 已开始收敛到 `AgentState`，不再由上下文模块私有持有。
 */

/**
 * 创建一套 agent 级插件注册表。
 */
export function createAgentPluginRegistry(): PluginRegistry {
  let pluginRegistryRef: PluginRegistry | null = null;

  const hookRegistry = new HookRegistry({
    contextResolver: () => getExecutionContext(),
    pluginEnabledChecker: (pluginName, context) => {
      const plugin = pluginRegistryRef?.get(pluginName);
      if (!plugin) return false;
      return isPluginEnabledInConfig({
        plugin,
        config: context.config,
      });
    },
  });

  const pluginRegistry = new PluginRegistry({
    contextResolver: () => getExecutionContext(),
    hookRegistry,
  });
  pluginRegistryRef = pluginRegistry;

  registerBuiltinPlugins({
    pluginRegistry,
  });

  return pluginRegistry;
}

/**
 * service 调用端口实现。
 */
const serviceInvokePort: InvokeServicePort = {
  async invoke(params: {
    service: string;
    action: string;
    payload?: JsonValue;
  }) {
    const serviceName = String(params.service || "").trim();
    const action = String(params.action || "").trim();
    if (!serviceName) {
      return {
        success: false,
        error: "invoke.service is required",
      };
    }
    if (!action) {
      return {
        success: false,
        error: "invoke.action is required",
      };
    }

    const result = await runServiceCommand({
      serviceName,
      command: action,
      payload: params.payload,
      context: getExecutionContext(),
    });
    if (!result.success) {
      return {
        success: false,
        error: result.message || "service invoke failed",
      };
    }

    return {
      success: true,
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  },
};

/**
 * 构建 session 端口。
 */
function buildSessionPort(input: AgentState): SessionPort {
  return {
    getRuntime: (sessionId) => input.sessionStore.getRuntime(sessionId),
    getPersistor: (sessionId) => input.sessionStore.getPersistor(sessionId),
    run: (params) =>
      input.sessionStore.run({
        sessionId: params.sessionId,
        query: params.query,
        ...(params.onStepCallback || params.onAssistantStepCallback
          ? {
              requestContext: {
                ...(params.onStepCallback
                  ? { onStepCallback: params.onStepCallback }
                  : {}),
                ...(params.onAssistantStepCallback
                  ? { onAssistantStepCallback: params.onAssistantStepCallback }
                  : {}),
              },
            }
          : {}),
      }),
    clearRuntime: (sessionId) => input.sessionStore.clearRuntime(sessionId),
    afterSessionUpdatedAsync: (sessionId) =>
      input.sessionStore.afterSessionUpdatedAsync(sessionId),
    appendUserMessage: (params) =>
      input.sessionStore.appendUserMessage({
        sessionId: params.sessionId,
        message: params.message,
        text: params.text,
        requestId: params.requestId,
        extra: params.extra,
      }),
    appendAssistantMessage: (params) =>
      input.sessionStore.appendAssistantMessage({
        sessionId: params.sessionId,
        message: params.message,
        fallbackText: params.fallbackText,
        requestId: params.requestId,
        extra: params.extra,
      }),
    model: input.model || requireAgentModel(),
  };
}

/**
 * 构建 plugin 端口。
 */
function buildPluginPort(input: AgentState): PluginPort {
  return {
    list(): PluginView[] {
      return input.pluginRegistry.list();
    },
    async availability(pluginName: string): Promise<PluginAvailability> {
      return input.pluginRegistry.availability(pluginName);
    },
    async runAction(params: {
      plugin: string;
      action: string;
      payload?: JsonValue;
    }) {
      return input.pluginRegistry.runAction(params);
    },
    async pipeline<T = JsonValue>(pointName: string, value: T): Promise<T> {
      return input.pluginRegistry.pipeline(pointName, value);
    },
    async guard<T = JsonValue>(pointName: string, value: T): Promise<void> {
      return input.pluginRegistry.guard(pointName, value);
    },
    async effect<T = JsonValue>(pointName: string, value: T): Promise<void> {
      return input.pluginRegistry.effect(pointName, value);
    },
    async resolve<TInput = JsonValue, TOutput = JsonValue>(
      pointName: string,
      value: TInput,
    ): Promise<TOutput> {
      return input.pluginRegistry.resolve<TInput, TOutput>(pointName, value);
    },
  };
}

/**
 * 从 agent 状态派生统一执行上下文。
 */
export function createExecutionContext(input: AgentState): ExecutionContext {
  return {
    agent: input,
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    systems: input.systems,
    session: buildSessionPort(input),
    invoke: serviceInvokePort,
    plugins: buildPluginPort(input),
  };
}

/**
 * 读取当前 agent 的统一执行上下文。
 */
export function getExecutionContext(): ExecutionContext {
  return createExecutionContext(getAgentState());
}

/**
 * 关键点（中文）
 * - 当前文件内的 service invoke port 既服务于 ExecutionContext，也可直接注入 shell tool。
 */
