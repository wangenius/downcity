import { DEFAULT_SHIP_PROMPTS } from "@core/prompts/System.js";
import { logger as defaultLogger, type Logger } from "@utils/logger/Logger.js";
import { ContextManager } from "@core/context/ContextManager.js";
import { ChatQueueWorker } from "@services/chat/runtime/ChatQueueWorker.js";
import { createModel } from "@core/llm/CreateModel.js";
import type {
  ServiceRuntime,
  ServiceContext,
  ServiceInvokePort,
} from "@/main/service/ServiceRuntime.js";
import {
  loadProjectDotenv,
  loadShipConfig,
  type ShipConfig,
} from "@/main/runtime/Config.js";
import {
  getAgentMdPath,
  getCacheDirPath,
  getLogsDirPath,
  getShipContextRootDirPath,
  getShipConfigDirPath,
  getShipDataDirPath,
  getShipDebugDirPath,
  getShipDirPath,
  getShipJsonPath,
  getShipProfileDirPath,
  getShipPublicDirPath,
  getShipTasksDirPath,
} from "@/main/runtime/Paths.js";
import { SERVICES } from "@main/service/Services.js";
import { runContextMemoryMaintenance } from "@services/memory/runtime/Service.js";
import { buildMemorySystemText } from "@services/memory/runtime/SystemProvider.js";
import { runServiceCommand } from "@main/service/Registry.js";
import type { JsonValue } from "@/types/Json.js";
import fs from "fs-extra";
import path from "path";
import { watch, type FSWatcher } from "node:fs";
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

const DEFAULT_AGENT_PROFILE = `# Agent Role
You are a helpful project assistant.`;
const HOT_RELOAD_DEBOUNCE_MS = 300;

let base: RuntimeStateBase | null = null;
let ready: RuntimeState | null = null;
let stopRuntimeHotReloadWatcher: (() => void) | null = null;
let serviceModel: LanguageModel | null = null;

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

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
 * 读取 Agent.md（含默认兜底）。
 */
function loadAgentProfileText(rootPath: string): string {
  let agentProfile = DEFAULT_AGENT_PROFILE;
  try {
    const content = fs.readFileSync(getAgentMdPath(rootPath), "utf-8").trim();
    if (content) agentProfile = content;
  } catch {
    // ignore
  }
  return agentProfile;
}

/**
 * 构建静态系统提示列表。
 */
function buildStaticSystems(agentProfile: string): string[] {
  return [agentProfile, DEFAULT_SHIP_PROMPTS].filter(Boolean);
}

function systemsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
 * 刷新 Agent.md 对应的静态系统提示。
 */
function reloadAgentMdSystems(reason: string): void {
  const runtime = getRuntimeStateBase();
  const nextSystems = buildStaticSystems(
    loadAgentProfileText(runtime.rootPath),
  );
  if (systemsEqual(runtime.systems, nextSystems)) return;

  applyRuntimeSystems(nextSystems);
  runtime.logger.info("Agent.md hot reloaded", {
    reason,
    agentMdPath: getAgentMdPath(runtime.rootPath),
  });
}

/**
 * 收集所有 service 的 system 文本。
 *
 * 关键点（中文）
 * - 每次请求时动态遍历 services，避免额外注册层。
 * - 单个 service 失败走 fail-open，不阻断主链路。
 */
export async function collectServiceSystemTexts(): Promise<string[]> {
  const runtime = getServiceRuntimeState();
  const out: string[] = [];
  for (const service of SERVICES) {
    if (typeof service.system !== "function") continue;
    try {
      const text = normalizeSystemText(await service.system(runtime));
      if (!text) continue;
      out.push(text);
    } catch {
      // fail-open
    }
  }

  try {
    const memoryText = normalizeSystemText(await buildMemorySystemText(runtime));
    if (memoryText) out.push(memoryText);
  } catch {
    // fail-open
  }

  return out;
}

/**
 * 停止 runtime 文件热重载监听。
 */
export function stopRuntimeHotReload(): void {
  if (!stopRuntimeHotReloadWatcher) return;
  stopRuntimeHotReloadWatcher();
  stopRuntimeHotReloadWatcher = null;
}

/**
 * 启动 runtime 文件热重载监听（Agent.md）。
 *
 * 监听策略（中文）
 * - Agent.md：监听项目根目录并过滤目标文件名，兼容 rename/replace。
 * - 所有回调都做 debounce，避免编辑器连续写入造成重复刷新。
 */
function startRuntimeHotReload(): void {
  stopRuntimeHotReload();

  const runtime = getRuntimeState();
  const watchers: FSWatcher[] = [];
  const timers = new Map<string, NodeJS.Timeout>();

  const clearAllTimers = (): void => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  const schedule = (key: string, task: () => void): void => {
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    const next = setTimeout(() => {
      timers.delete(key);
      task();
    }, HOT_RELOAD_DEBOUNCE_MS);
    timers.set(key, next);
  };

  const attachWatcher = (
    watchPath: string,
    options: { recursive?: boolean },
    onChange: (eventType: string, filename: string) => void,
  ): boolean => {
    try {
      const watcher = watch(
        watchPath,
        { recursive: Boolean(options.recursive) },
        (eventType, filename) => {
          const normalized = filename
            ? Buffer.isBuffer(filename)
              ? filename.toString("utf-8")
              : String(filename)
            : "";
          onChange(eventType, normalized);
        },
      );
      watcher.on("error", (error) => {
        runtime.logger.warn("Hot reload watcher runtime error", {
          watchPath,
          error: String(error),
        });
      });
      watchers.push(watcher);
      return true;
    } catch (error) {
      runtime.logger.warn("Hot reload watcher attach failed", {
        watchPath,
        error: String(error),
      });
      return false;
    }
  };

  // Agent.md：监听项目根目录（文件替换/重命名也能捕获）。
  attachWatcher(runtime.rootPath, {}, (_eventType, filename) => {
    if (filename && path.basename(filename) !== "Agent.md") return;
    schedule("agent-md", () => reloadAgentMdSystems("agent_md_changed"));
  });

  stopRuntimeHotReloadWatcher = () => {
    clearAllTimers();
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
  };

  runtime.logger.info("Runtime hot reload enabled", {
    agentMdPath: getAgentMdPath(runtime.rootPath),
    watchers: watchers.length,
  });
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
 * 构建 service context（会话管理 + 模型）。
 *
 * 关键点（中文）
 * - `context` 字段是 service 侧访问会话与模型能力的唯一入口。
 * - 这里不直接暴露 ContextManager 实例，避免上层依赖具体实现细节。
 */
function buildServiceContext(input: RuntimeState): ServiceContext {
  return {
    getAgent: (contextId) => input.contextManager.getAgent(contextId),
    getContextStore: (contextId) =>
      input.contextManager.getContextStore(contextId),
    clearAgent: (contextId) => input.contextManager.clearAgent(contextId),
    afterContextUpdatedAsync: (contextId) =>
      input.contextManager.afterContextUpdatedAsync(contextId),
    appendUserMessage: (params) =>
      input.contextManager.appendUserMessage(params),
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

  ensureContextFiles(rootPath);
  ensureShipDirectories(rootPath);

  // 在启动时加载 dotenv，确保后续 config / channels 可读取环境变量。
  loadProjectDotenv(rootPath);

  const config = loadShipConfig(rootPath);

  // 关键点（中文）：先初始化 base runtime state，保证底层模块可直接读取 rootPath/config/utils/logger/systems。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    systems: [],
  });

  const systems = buildStaticSystems(loadAgentProfileText(rootPath));

  // 关键点（中文）：systems 在启动时确认后写回 base runtime state，供后续模块读取。
  setRuntimeStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    systems,
  });

  // 关键点（中文）：模型实例在 main 启动时创建一次，并注入给 services 复用。
  // 模型是 ServiceContext 必需能力，初始化失败直接中断启动（fail-fast）。
  serviceModel = null;
  serviceModel = await createModel({ config });

  let contextManager: ContextManager;
  contextManager = new ContextManager({
    runMemoryMaintenance: async (contextId) =>
      runContextMemoryMaintenance({
        context: getServiceRuntimeState(),
        contextId,
      }),
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

/**
 * 校验项目初始化关键文件。
 */
function ensureContextFiles(projectRoot: string): void {
  // Check if initialized（启动入口一次性确认工程根目录与关键文件）
  if (!fs.existsSync(getAgentMdPath(projectRoot))) {
    console.error(
      '❌ Project not initialized. Please run "shipmyagent init" first',
    );
    process.exit(1);
  }

  if (!fs.existsSync(getShipJsonPath(projectRoot))) {
    console.error(
      '❌ ship.json does not exist. Please run "shipmyagent init" first',
    );
    process.exit(1);
  }
}

/**
 * 确保 `.ship` 运行目录结构完整。
 */
function ensureShipDirectories(projectRoot: string): void {
  // 关键点（中文）：尽量只在启动时确保目录结构存在，避免在 Agent/Tool 执行过程中反复 ensure。
  fs.ensureDirSync(getShipDirPath(projectRoot));
  fs.ensureDirSync(getShipTasksDirPath(projectRoot));
  fs.ensureDirSync(getLogsDirPath(projectRoot));
  fs.ensureDirSync(getCacheDirPath(projectRoot));
  fs.ensureDirSync(getShipProfileDirPath(projectRoot));
  fs.ensureDirSync(getShipDataDirPath(projectRoot));
  fs.ensureDirSync(getShipContextRootDirPath(projectRoot));
  fs.ensureDirSync(getShipPublicDirPath(projectRoot));
  fs.ensureDirSync(getShipConfigDirPath(projectRoot));
  fs.ensureDirSync(path.join(getShipDirPath(projectRoot), "schema"));
  fs.ensureDirSync(getShipDebugDirPath(projectRoot));
}
