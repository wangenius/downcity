import { logger as defaultLogger, type Logger } from "@utils/logger/Logger.js";
import { ContextManager } from "@agent/context/manager/ContextManager.js";
import { ContextAgentDispatcher } from "@agent/context/context-agent/ContextAgentDispatcher.js";
import { ChatQueueWorker } from "@services/chat/runtime/ChatQueueWorker.js";
import { createModel } from "@console/model/CreateModel.js";
import type {
  ServiceRuntime,
  ServiceContext,
  ExtensionInvokePort,
  ServiceInvokePort,
} from "@/agent/service/ServiceRuntime.js";
import {
  loadProjectDotenv,
  loadShipConfig,
  type ShipConfig,
} from "@/console/env/Config.js";
import {
  getTaskRunDir,
  parseTaskRunContextId,
} from "@services/task/runtime/Paths.js";
import { runServiceCommand } from "@agent/service/Manager.js";
import { runExtensionCommand } from "@console/extension/Manager.js";
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
import path from "path";
import type { LanguageModel } from "ai";

/**
 * RuntimeState：ShipMyAgent 进程级运行时状态（单例）。
 *
 * 设计目标（中文，关键节点）
 * - 单进程只服务一个 rootPath，因此把 rootPath/config/utils/logger/systems 放到全局单例里读取
 * - 业务模块不再通过参数层层透传运行时状态（极简）
 *
 * 初始化时序（关键节点）
 * - 启动入口先 `setRuntimeStateBase(...)`
 * - 初始化 ContextManager + ChatQueueWorker 后再 `setRuntimeState(...)`
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
  config: ShipConfig;
  systems: string[];
};

export type RuntimeState = RuntimeStateBase & {
  contextManager: ContextManager;
};

let base: RuntimeStateBase | null = null;
let ready: RuntimeState | null = null;
let promptRuntime: PromptRuntime | null = null;
let serviceModel: LanguageModel | null = null;

/**
 * 读取 service 运行时模型（必填）。
 *
 * 关键点（中文）
 * - `ServiceContext.model` 是必需能力；若缺失则视为启动链路异常。
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
 * 启动 runtime 文件热重载监听（PROFILE.md / SOUL.md / USER.md）。
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
 * extension 调用端口实现。
 *
 * 关键点（中文）
 * - services 通过 extensions.invoke 调用 extension action。
 * - main 侧负责分发与错误语义统一。
 */
const extensionInvokePort: ExtensionInvokePort = {
  async invoke(params: {
    extension: string;
    action: string;
    payload?: JsonValue;
  }) {
    const extensionName = String(params.extension || "").trim();
    const action = String(params.action || "").trim();
    if (!extensionName) {
      return {
        success: false,
        error: "extensions.invoke.extension is required",
      };
    }
    if (!action) {
      return {
        success: false,
        error: "extensions.invoke.action is required",
      };
    }

    const result = await runExtensionCommand({
      extensionName,
      command: action,
      payload: params.payload,
      context: getServiceRuntimeState(),
    });
    if (!result.success) {
      return {
        success: false,
        error: result.message || "extension invoke failed",
      };
    }

    return {
      success: true,
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  },
};

/**
 * 构建 service context（会话管理 + 模型）。
 *
 * 关键点（中文）
 * - `context` 字段是 service 侧访问会话与模型能力的唯一入口。
 * - 这里不直接暴露 ContextManager 实例，避免上层依赖具体实现细节。
 */
function buildServiceContext(input: RuntimeState): ServiceContext {
  return {
    getAgent: (contextId) => input.contextManager.getAgent(contextId),
    getPersistor: (contextId) => input.contextManager.getPersistor(contextId),
    run: (params) =>
      input.contextManager.run({
        contextId: params.contextId,
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
    clearAgent: (contextId) => input.contextManager.clearAgent(contextId),
    afterContextUpdatedAsync: (contextId) =>
      input.contextManager.afterContextUpdatedAsync(contextId),
    appendUserMessage: (params) =>
      input.contextManager.appendUserMessage(params),
    appendAssistantMessage: (params) =>
      input.contextManager.appendAssistantMessage(params),
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
    systems: input.systems,
    context: buildServiceContext(input),
    invoke: serviceInvokePort,
    extensions: extensionInvokePort,
  };
}

/**
 * 获取完整 service runtime state。
 */
export function getServiceRuntimeState(): ServiceRuntime {
  return buildServiceRuntime(getRuntimeState());
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
    "Runtime state is not ready yet. Ensure ContextManager is initialized before access.",
  );
}

/**
 * 初始化入口。
 *
 * 阶段说明（中文）
 * 1) 解析 rootPath + 绑定 logger 落盘目录
 * 2) 校验关键文件并确保 `.ship` 目录结构
 * 3) 加载 dotenv + ship.json，建立 base runtime state
 * 4) 初始化 ContextManager + ChatQueueWorker，建立 ready runtime state
 */

export async function initRuntimeState(cwd: string): Promise<void> {
  stopRuntimeHotReload();

  const resolvedCwd = String(cwd || "").trim() || ".";
  const rootPath = path.resolve(resolvedCwd);

  // 关键点（中文）：绑定 logger 的落盘目录（.ship/logs/*）到当前 rootPath。
  // 这样可以移除全局 ROOT/CWD 单例模块，避免初始化时序与 import 副作用。
  defaultLogger.bindProjectRoot(rootPath);

  ensureRuntimeProjectReady(rootPath);

  // 在启动时加载 dotenv（console -> project）并读取 ship.json（支持继承/覆盖）。
  const config = loadShipConfig(rootPath);

  // 关键点（中文）：先初始化 base runtime state，保证底层模块可直接读取 rootPath/config/utils/logger/systems。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    systems: [],
  });

  const systems = loadStaticSystems(rootPath);

  // 关键点（中文）：systems 在启动时确认后写回 base runtime state，供后续模块读取。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    systems,
  });

  // 关键点（中文）：在 runtime 初始化阶段注入 shell 所需快照，避免 tools/shell 反向依赖 RuntimeState。
  setShellToolRuntime({
    rootPath,
    config,
  });

  // 关键点（中文）：模型实例在 main 启动时创建一次，并注入给 services 复用。
  // 模型是 ServiceContext 必需能力，初始化失败直接中断启动（fail-fast）。
  serviceModel = null;
  serviceModel = await createModel({
    config,
    getRequestContext,
  });

  let contextManager: ContextManager;
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
    profile: "chat",
  });
  const dispatcher = new ContextAgentDispatcher({
    model: requireServiceModel(),
    logger: defaultLogger,
    createPersistor: (contextId) => {
      const parsedRun = parseTaskRunContextId(contextId);
      const paths = parsedRun
        ? (() => {
            const runDir = getTaskRunDir(
              rootPath,
              parsedRun.taskId,
              parsedRun.timestamp,
            );
            return {
              contextDirPath: runDir,
              messagesDirPath: runDir,
              messagesFilePath: path.join(runDir, "messages.jsonl"),
              metaFilePath: path.join(runDir, "meta.json"),
              archiveDirPath: path.join(runDir, "archive"),
            };
          })()
        : undefined;
      return new FilePersistor({
        rootPath,
        contextId,
        ...(paths ? { paths } : {}),
      });
    },
    compactor,
    system,
    getTools: () => shellTools,
  });
  contextManager = new ContextManager({
    dispatcher,
  });

  const runtimeStateForServices: RuntimeState = {
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    systems,
    contextManager,
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
    systems,
    contextManager,
  });
  startRuntimeHotReload();
}
