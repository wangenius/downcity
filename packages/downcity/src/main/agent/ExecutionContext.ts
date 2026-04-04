/**
 * ExecutionContext 构造模块。
 *
 * 关键点（中文）
 * - 这里负责从 `AgentState` 派生统一执行上下文，供 service、plugin、session tool 复用。
 * - `ExecutionContext` 表达的是“执行期能力面”，不是宿主本体；真正的宿主状态仍由 `AgentState` 持有。
 * - 该模块把 service invoke、plugin port、chat runtime port 收敛成稳定端口集合。
 */

import type {
  ChatRuntimePort,
  ExecutionContext,
  InvokeServicePort,
  SessionPort,
} from "@/shared/types/ExecutionContext.js";
import type { JsonValue } from "@/shared/types/Json.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginView,
} from "@/shared/types/Plugin.js";
import type { AgentState } from "@/shared/types/AgentState.js";
import { runServiceCommand } from "@/main/service/Manager.js";
import { getPluginManager } from "@/main/plugin/PluginManager.js";
import { getAgentState } from "@/main/agent/RuntimeState.js";
import { appendExecSessionMessage } from "@services/chat/runtime/ChatIngressStore.js";
import { readChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";
import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueue.js";

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
    ...(input.model ? { model: input.model } : {}),
  };
}

/**
 * 构建 plugin 端口。
 */
function buildPluginPort(input: AgentState): PluginPort {
  return {
    list(): PluginView[] {
      return getPluginManager().list();
    },
    async availability(pluginName: string): Promise<PluginAvailability> {
      return getPluginManager().availability(pluginName);
    },
    async runAction(params: {
      plugin: string;
      action: string;
      payload?: JsonValue;
    }) {
      return getPluginManager().runAction(params);
    },
    async pipeline<T = JsonValue>(pointName: string, value: T): Promise<T> {
      return getPluginManager().pipeline(pointName, value);
    },
    async guard<T = JsonValue>(pointName: string, value: T): Promise<void> {
      return getPluginManager().guard(pointName, value);
    },
    async effect<T = JsonValue>(pointName: string, value: T): Promise<void> {
      return getPluginManager().effect(pointName, value);
    },
    async resolve<TInput = JsonValue, TOutput = JsonValue>(
      pointName: string,
      value: TInput,
    ): Promise<TOutput> {
      return getPluginManager().resolve<TInput, TOutput>(pointName, value);
    },
  };
}

/**
 * 构建 chat 运行时端口。
 */
function buildChatPort(getContext: () => ExecutionContext): ChatRuntimePort {
  return {
    async readMetaBySessionId(sessionId: string) {
      return readChatMetaBySessionId({
        context: getContext(),
        sessionId,
      });
    },
    async appendExecSessionMessage(params) {
      await appendExecSessionMessage({
        context: getContext(),
        sessionId: params.sessionId,
        text: params.text,
        extra: params.extra,
      });
    },
    enqueue(params) {
      return resolveChatQueueStore(getContext()).enqueue(params);
    },
  };
}

/**
 * 从 agent 状态派生统一执行上下文。
 */
export function createExecutionContext(input: AgentState): ExecutionContext {
  let context!: ExecutionContext;
  context = {
    agent: input,
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    globalEnv: input.globalEnv,
    systems: input.systems,
    paths: input.paths,
    auth: input.auth,
    pluginConfig: input.pluginConfig,
    session: buildSessionPort(input),
    invoke: serviceInvokePort,
    chat: buildChatPort(() => context),
    plugins: buildPluginPort(input),
  };
  return context;
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
