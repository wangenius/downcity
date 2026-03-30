import type { ExecutionRuntime, InvokeServicePort, SessionPort } from "@/types/ExecutionRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginRuntimeView,
} from "@/types/Plugin.js";
import { runServiceCommand } from "@/main/service/Manager.js";
import { isPluginEnabledInConfig } from "@/main/plugin/Activation.js";
import { HookRegistry } from "@/main/plugin/HookRegistry.js";
import { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/main/plugin/Plugins.js";
import {
  getAgentRuntime,
  requireExecutionModel,
  type AgentRuntime,
} from "@agent/RuntimeState.js";

/**
 * ExecutionRuntime 构造模块。
 *
 * 关键点（中文）
 * - 这里专门负责从 AgentRuntime 派生统一执行视图。
 * - AgentRuntime 不再同时承担“宿主状态 + 执行端口装配”两类职责。
 * - plugin registry / hook registry 也收敛在这里，避免宿主初始化文件过度膨胀。
 */

let pluginRegistryRef: PluginRegistry | null = null;

const hookRegistry = new HookRegistry({
  runtimeResolver: () => getExecutionRuntime(),
  pluginEnabledChecker: (pluginName, runtime) => {
    const plugin = pluginRegistryRef?.get(pluginName);
    if (!plugin) return false;
    return isPluginEnabledInConfig({
      plugin,
      config: runtime.config,
    });
  },
});

const pluginRegistry = new PluginRegistry({
  runtimeResolver: () => getExecutionRuntime(),
  hookRegistry,
});

pluginRegistryRef = pluginRegistry;

registerBuiltinPlugins({
  pluginRegistry,
});

/**
 * service 调用端口实现。
 *
 * 关键点（中文）
 * - services 通过 invoke 调用其他 service action。
 * - 这里统一处理参数校验和错误语义。
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
      context: getExecutionRuntime(),
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
 * plugin 调用端口实现。
 *
 * 关键点（中文）
 * - plugin 不维护独立 runtime 状态机。
 * - 这里只暴露声明式能力面：list / availability / runAction / hook points。
 */
const pluginPort: PluginPort = {
  list(): PluginRuntimeView[] {
    return pluginRegistry.list();
  },
  async availability(pluginName: string): Promise<PluginAvailability> {
    return pluginRegistry.availability(pluginName);
  },
  async runAction(params: {
    plugin: string;
    action: string;
    payload?: JsonValue;
  }) {
    return pluginRegistry.runAction(params);
  },
  async pipeline<T = JsonValue>(pointName: string, value: T): Promise<T> {
    return pluginRegistry.pipeline(pointName, value);
  },
  async guard<T = JsonValue>(pointName: string, value: T): Promise<void> {
    return pluginRegistry.guard(pointName, value);
  },
  async effect<T = JsonValue>(pointName: string, value: T): Promise<void> {
    return pluginRegistry.effect(pointName, value);
  },
  async resolve<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput> {
    return pluginRegistry.resolve<TInput, TOutput>(pointName, value);
  },
};

/**
 * 构建 session 端口。
 *
 * 关键点（中文）
 * - execution runtime 只暴露会话能力，不直接暴露 registry 细节。
 */
function buildSessionPort(input: AgentRuntime): SessionPort {
  return {
    getRuntime: (sessionId) => input.sessionRegistry.getRuntime(sessionId),
    getPersistor: (sessionId) => input.sessionRegistry.getPersistor(sessionId),
    run: (params) =>
      input.sessionRegistry.run({
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
    clearRuntime: (sessionId) => input.sessionRegistry.clearRuntime(sessionId),
    afterSessionUpdatedAsync: (sessionId) =>
      input.sessionRegistry.afterSessionUpdatedAsync(sessionId),
    appendUserMessage: (params) =>
      input.sessionRegistry.appendUserMessage({
        sessionId: params.sessionId,
        message: params.message,
        text: params.text,
        requestId: params.requestId,
        extra: params.extra,
      }),
    appendAssistantMessage: (params) =>
      input.sessionRegistry.appendAssistantMessage({
        sessionId: params.sessionId,
        message: params.message,
        fallbackText: params.fallbackText,
        requestId: params.requestId,
        extra: params.extra,
      }),
    model: requireExecutionModel(),
  };
}

/**
 * 从宿主状态派生统一执行运行时。
 */
export function createExecutionRuntime(input: AgentRuntime): ExecutionRuntime {
  return {
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    systems: input.systems,
    session: buildSessionPort(input),
    invoke: serviceInvokePort,
    services: serviceInvokePort,
    plugins: pluginPort,
  };
}

/**
 * 读取当前 agent 的统一执行运行时。
 */
export function getExecutionRuntime(): ExecutionRuntime {
  return createExecutionRuntime(getAgentRuntime());
}

/**
 * 暴露给 shell tool 的 service invoke 端口。
 *
 * 关键点（中文）
 * - shell tool 只需要最小的 service invoke 能力，不需要整套 runtime。
 */
export function getInvokeServicePort(): InvokeServicePort {
  return serviceInvokePort;
}
