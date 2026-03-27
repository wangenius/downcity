import { logger as defaultLogger, type Logger } from "@utils/logger/Logger.js";
import { SessionManager } from "@agent/context/manager/SessionManager.js";
import { SessionAgentDispatcher } from "@agent/context/context-agent/SessionAgentDispatcher.js";
import { ChatQueueWorker } from "@services/chat/runtime/ChatQueueWorker.js";
import { createModel } from "@console/model/CreateModel.js";
import type {
  ServiceRuntime,
  ServiceSession,
  ServiceInvokePort,
} from "@/console/service/ServiceRuntime.js";
import {
  loadGlobalEnvFromStore,
  loadAgentRuntimeEnv,
  loadDowncityConfig,
  type DowncityConfig,
} from "@/console/env/Config.js";
import {
  getTaskRunDir,
  parseTaskRunSessionId,
} from "@services/task/runtime/Paths.js";
import { runServiceCommand } from "@/console/service/Manager.js";
import { isPluginEnabledInConfig } from "@/console/plugin/Activation.js";
import { HookRegistry } from "@/console/plugin/HookRegistry.js";
import { AssetRegistry } from "@/console/plugin/AssetRegistry.js";
import { PluginRegistry } from "@/console/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/console/plugin/Plugins.js";
import { setShellToolRuntime, shellTools } from "@agent/tools/shell/Tool.js";
import { getRequestContext } from "@agent/context/manager/RequestContext.js";
import { FilePersistor } from "@/agent/context/context-agent/components/FilePersistor.js";
import { SummaryCompactor } from "@/agent/context/context-agent/components/SummaryCompactor.js";
import { PromptSystem } from "@agent/prompts/system/PromptSystem.js";
import { ensureRuntimeProjectReady } from "@console/daemon/ProjectSetup.js";
import {
  loadStaticSystems,
  PromptRuntime,
} from "@agent/prompts/PromptRuntime.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  AssetInstallInput,
  AssetPort,
  AssetCheckResult,
  AssetInstallResult,
  StructuredConfig,
} from "@/types/Asset.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginRuntime,
  PluginRuntimeView,
} from "@/types/Plugin.js";
import path from "path";
import type { LanguageModel } from "ai";

/**
 * RuntimeState：Downcity 进程级运行时状态（单例）。
 *
 * 设计目标（中文，关键节点）
 * - 单进程只服务一个 rootPath，因此把 rootPath/config/utils/logger/systems 放到全局单例里读取
 * - 业务模块不再通过参数层层透传运行时状态（极简）
 *
 * 初始化时序（关键节点）
 * - 启动入口先 `setRuntimeStateBase(...)`
 * - 初始化 SessionManager + ChatQueueWorker 后再 `setRuntimeState(...)`
 * - 业务模块只调用 `getRuntimeState()`（未 ready 会抛错）
 */
export type RuntimeStateBase = {
  cwd: string;
  /**
   * 工程根目录（rootPath）。
   *
   * 关键点（中文）
   * - 一个进程只服务一个 rootPath
   * - 任何需要路径的模块都从这里读取，避免层层透传
   */
  rootPath: string;
  logger: Logger;
  config: DowncityConfig;
  /**
   * 当前 agent 的 `.env` 快照（局部作用域）。
   */
  env: Record<string, string>;
  systems: string[];
};

export type RuntimeState = RuntimeStateBase & {
  sessionManager: SessionManager;
};

let base: RuntimeStateBase | null = null;
let ready: RuntimeState | null = null;
let promptRuntime: PromptRuntime | null = null;
let serviceModel: LanguageModel | null = null;

let pluginRegistryRef: PluginRegistry | null = null;

const hookRegistry = new HookRegistry({
  runtimeResolver: () => getPluginRuntimeState(),
  pluginEnabledChecker: (pluginName, runtime) => {
    const plugin = pluginRegistryRef?.get(pluginName);
    if (!plugin) return false;
    return isPluginEnabledInConfig({
      plugin,
      config: runtime.config,
    });
  },
});
const assetRegistry = new AssetRegistry(() => getPluginRuntimeState());
const pluginRegistry = new PluginRegistry({
  runtimeResolver: () => getPluginRuntimeState(),
  hookRegistry,
  assetRegistry,
});
pluginRegistryRef = pluginRegistry;

registerBuiltinPlugins({
  assetRegistry,
  pluginRegistry,
});

/**
 * 读取 service 运行时模型（必填）。
 *
 * 关键点（中文）
 * - `ServiceSession.model` 是必需能力；若缺失则视为启动链路异常。
 */
function requireServiceModel(): LanguageModel {
  if (serviceModel) return serviceModel;
  throw new Error(
    "Service runtime model is not initialized. Ensure initRuntimeState() completed successfully.",
  );
}

/**
 * 原子更新 runtime.systems（同时覆盖 base + ready）。
 *
 * 关键点（中文）
 * - `setRuntimeStateBase` 会清空 ready，因此必须先抓取旧 ready 再恢复。
 */
function applyRuntimeSystems(nextSystems: string[]): void {
  const currentBase = getRuntimeStateBase();
  const currentReady = ready;
  setRuntimeStateBase({
    ...currentBase,
    systems: nextSystems,
  });
  if (currentReady) {
    setRuntimeState({
      ...currentReady,
      systems: nextSystems,
    });
  }
}

/**
 * 停止 runtime 文件热重载监听。
 */
export function stopRuntimeHotReload(): void {
  if (!promptRuntime) return;
  promptRuntime.stop();
  promptRuntime = null;
}

/**
 * 启动 runtime 文件热重载监听（PROFILE.md / SOUL.md）。
 */
function startRuntimeHotReload(): void {
  stopRuntimeHotReload();
  const runtime = getRuntimeState();
  promptRuntime = new PromptRuntime({
    rootPath: runtime.rootPath,
    logger: runtime.logger,
    getCurrentSystems: () => getRuntimeStateBase().systems,
    applySystems: (nextSystems) => {
      applyRuntimeSystems(nextSystems);
    },
  });
  promptRuntime.start();
}

/**
 * service 调用端口实现。
 *
 * 关键点（中文）
 * - services 通过 invoke 调用其他 service action。
 * - main 侧负责分发与错误语义统一。
 */
const serviceInvokePort: ServiceInvokePort = {
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
      context: getServiceRuntimeState(),
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
 * asset 调用端口实现。
 *
 * 关键点（中文）
 * - Asset 负责底层资源检查、安装、解析与配置读写。
 * - Plugin 与业务代码都不应直接拼装模型/依赖安装逻辑。
 */
const assetPort: AssetPort = {
  list() {
    return assetRegistry.list();
  },
  async check(assetName: string): Promise<AssetCheckResult> {
    return assetRegistry.check(assetName);
  },
  async install<TInstallInput extends AssetInstallInput = AssetInstallInput>(
    assetName: string,
    input?: TInstallInput,
  ): Promise<AssetInstallResult> {
    return assetRegistry.install(assetName, input);
  },
  async use<THandle = unknown>(assetName: string): Promise<THandle> {
    return assetRegistry.use<THandle>(assetName);
  },
  async getConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
  ): Promise<TConfig | null> {
    return assetRegistry.getConfig<TConfig>(assetName);
  },
  async setConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
    value: Partial<TConfig>,
  ): Promise<TConfig> {
    return assetRegistry.setConfig<TConfig>(assetName, value);
  },
};

/**
 * plugin 调用端口实现。
 *
 * 关键点（中文）
 * - Plugin 不再维护运行状态，而是暴露声明式能力面。
 * - 当前先支持 list / availability / runAction 三个最小能力。
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
 * 构建 service session（会话管理 + 模型）。
 *
 * 关键点（中文）
 * - `session` 字段是 service 侧访问会话与模型能力的唯一入口。
 * - 这里不直接暴露 SessionManager 实例，避免上层依赖具体实现细节。
 */
function buildServiceSession(input: RuntimeState): ServiceSession {
  return {
    getAgent: (sessionId) => input.sessionManager.getAgent(sessionId),
    getPersistor: (sessionId) => input.sessionManager.getPersistor(sessionId),
    run: (params) =>
      input.sessionManager.run({
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
    clearAgent: (sessionId) => input.sessionManager.clearAgent(sessionId),
    afterSessionUpdatedAsync: (sessionId) =>
      input.sessionManager.afterSessionUpdatedAsync(sessionId),
    appendUserMessage: (params) =>
      input.sessionManager.appendUserMessage({
        sessionId: params.sessionId,
        message: params.message,
        text: params.text,
        requestId: params.requestId,
        extra: params.extra,
      }),
    appendAssistantMessage: (params) =>
      input.sessionManager.appendAssistantMessage({
        sessionId: params.sessionId,
        message: params.message,
        fallbackText: params.fallbackText,
        requestId: params.requestId,
        extra: params.extra,
      }),
    model: requireServiceModel(),
  };
}

/**
 * 构建 service runtime。
 */
function buildServiceRuntime(input: RuntimeState): ServiceRuntime {
  return {
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    systems: input.systems,
    session: buildServiceSession(input),
    invoke: serviceInvokePort,
    services: serviceInvokePort,
    plugins: pluginPort,
  };
}

/**
 * 构建 plugin runtime。
 *
 * 关键点（中文）
 * - plugin runtime 是独立视图，不再复用 ServiceRuntime。
 * - `assets` 只暴露给 plugin，不再成为 service 的一级能力面。
 */
function buildPluginRuntime(input: RuntimeState): PluginRuntime {
  return {
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    systems: input.systems,
    session: buildServiceSession(input),
    invoke: serviceInvokePort,
    services: serviceInvokePort,
    assets: assetPort,
    plugins: pluginPort,
  };
}

/**
 * 获取完整 service runtime state。
 */
export function getServiceRuntimeState(): ServiceRuntime {
  return buildServiceRuntime(getRuntimeState());
}

/**
 * 获取完整 plugin runtime state。
 *
 * 关键点（中文）
 * - plugin runtime 与 service runtime 现在显式分离。
 * - service 不再暴露 `assets`，plugin 仍可通过专用 runtime 访问 asset 基础设施。
 */
export function getPluginRuntimeState(): PluginRuntime {
  return buildPluginRuntime(getRuntimeState());
}

/**
 * 设置 base runtime state（未 ready）。
 *
 * 关键点（中文）
 * - 每次更新 base 都会重置 ready，避免读取到过期对象。
 */
export function setRuntimeStateBase(next: RuntimeStateBase): void {
  base = next;
  ready = null;
}

/**
 * 设置 ready runtime state（完整可用）。
 */
export function setRuntimeState(next: RuntimeState): void {
  base = next;
  ready = next;
}

/**
 * 获取 base runtime state。
 *
 * 失败语义（中文）
 * - 未初始化直接抛错，提示启动阶段必须先调用 init。
 */
export function getRuntimeStateBase(): RuntimeStateBase {
  if (base) return base;
  throw new Error(
    "Runtime state (base) is not initialized. Call initRuntimeState() during startup.",
  );
}

/**
 * 获取 ready runtime state。
 *
 * 失败语义（中文）
 * - base 未初始化：启动流程缺失。
 * - base 已有但 ready 为空：说明初始化尚未完成。
 */
export function getRuntimeState(): RuntimeState {
  if (ready) return ready;
  if (!base) {
    throw new Error(
      "Runtime state is not initialized. Call initRuntimeState() during startup.",
    );
  }
  throw new Error(
    "Runtime state is not ready yet. Ensure SessionManager is initialized before access.",
  );
}

/**
 * 初始化入口。
 *
 * 阶段说明（中文）
 * 1) 解析 rootPath + 绑定 logger 落盘目录
 * 2) 校验关键文件并确保 `.downcity` 目录结构
 * 3) 加载 dotenv + downcity.json，建立 base runtime state
 * 4) 初始化 SessionManager + ChatQueueWorker，建立 ready runtime state
 */

export async function initRuntimeState(cwd: string): Promise<void> {
  stopRuntimeHotReload();

  const resolvedCwd = String(cwd || "").trim() || ".";
  const rootPath = path.resolve(resolvedCwd);

  // 关键点（中文）：绑定 logger 的落盘目录（.downcity/logs/*）到当前 rootPath。
  // 这样可以移除全局 ROOT/CWD 单例模块，避免初始化时序与 import 副作用。
  defaultLogger.bindProjectRoot(rootPath);

  ensureRuntimeProjectReady(rootPath);

  // 在启动时加载 agent runtime env 快照并读取 downcity.json（支持继承/覆盖）。
  const globalEnv = loadGlobalEnvFromStore();
  const projectEnv = loadAgentRuntimeEnv(rootPath);
  const config = loadDowncityConfig(rootPath, {
    projectEnv,
    globalEnv,
  });
  // 关键点（中文）：统一注入当前 agent 标识，供 shell/CLI 子命令默认解析。
  process.env.DC_AGENT_PATH = rootPath;
  process.env.DC_AGENT_NAME = String(config.name || path.basename(rootPath));

  // 关键点（中文）：先初始化 base runtime state，保证底层模块可直接读取 rootPath/config/utils/logger/systems。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems: [],
  });

  const systems = loadStaticSystems(rootPath);

  // 关键点（中文）：systems 在启动时确认后写回 base runtime state，供后续模块读取。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
  });

  // 关键点（中文）：模型实例在 main 启动时创建一次，并注入给 services 复用。
  // 模型是 ServiceSession 必需能力，初始化失败直接中断启动（fail-fast）。
  serviceModel = null;
  serviceModel = await createModel({
    config,
    getRequestContext,
  });

  let sessionManager: SessionManager;
  const compactor = new SummaryCompactor({
    keepLastMessages: config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: config.context?.messages?.archiveOnCompact,
    compactRatio: config.context?.messages?.compactRatio,
  });
  // 关键点（中文）：system 域逻辑全部收敛到 prompts/system，runtime 这里只做依赖注入。
  const system = new PromptSystem({
    projectRoot: rootPath,
    getStaticSystemPrompts: () => getRuntimeStateBase().systems,
    getRuntime: () => getServiceRuntimeState(),
    getPluginRuntime: () => getPluginRuntimeState(),
    profile: "chat",
  });
  const dispatcher = new SessionAgentDispatcher({
    model: requireServiceModel(),
    logger: defaultLogger,
    createPersistor: (sessionId) => {
      const parsedRun = parseTaskRunSessionId(sessionId);
      const paths = parsedRun
        ? (() => {
            const runDir = getTaskRunDir(
              rootPath,
              parsedRun.taskId,
              parsedRun.timestamp,
            );
            return {
              sessionDirPath: runDir,
              messagesDirPath: runDir,
              messagesFilePath: path.join(runDir, "messages.jsonl"),
              metaFilePath: path.join(runDir, "meta.json"),
              archiveDirPath: path.join(runDir, "archive"),
            };
          })()
        : undefined;
      return new FilePersistor({
        rootPath,
        sessionId,
        ...(paths ? { paths } : {}),
      });
    },
    compactor,
    system,
    getTools: () => shellTools,
  });
  sessionManager = new SessionManager({
    dispatcher,
  });

  const runtimeStateForServices: RuntimeState = {
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
    sessionManager,
  };
  const chatWorkerRuntime: ServiceRuntime = buildServiceRuntime(
    runtimeStateForServices,
  );
  const chatQueueWorker = new ChatQueueWorker({
    logger: defaultLogger,
    context: chatWorkerRuntime,
    config: config.services?.chat?.queue,
  });
  chatQueueWorker.start();

  setRuntimeState({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
    sessionManager,
  });
  setShellToolRuntime({
    invokeService: (params) => serviceInvokePort.invoke(params),
  });
  startRuntimeHotReload();
}
