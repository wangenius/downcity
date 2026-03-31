import path from "path";
import { logger as defaultLogger } from "@utils/logger/Logger.js";
import { SessionStore } from "@sessions/SessionStore.js";
import { SessionRuntimeStore } from "@sessions/SessionRuntimeStore.js";
import { createModel } from "@main/model/CreateModel.js";
import {
  loadGlobalEnvFromStore,
  loadAgentEnvSnapshot,
  loadDowncityConfig,
} from "@/main/env/Config.js";
import {
  getTaskRunDir,
  parseTaskRunSessionId,
} from "@services/task/runtime/Paths.js";
import { setShellToolRuntime, shellTools } from "@sessions/tools/shell/Tool.js";
import { getRequestContext } from "@sessions/RequestContext.js";
import { FilePersistor } from "@sessions/runtime/FilePersistor.js";
import { SummaryCompactor } from "@sessions/runtime/SummaryCompactor.js";
import { PromptSystem } from "@sessions/prompts/system/PromptSystem.js";
import { ensureRuntimeProjectReady } from "@main/daemon/ProjectSetup.js";
import {
  loadStaticSystems,
  PromptRuntime,
} from "@sessions/prompts/PromptRuntime.js";
import {
  createAgentPluginRegistry,
  getExecutionContext,
} from "@agent/ExecutionContext.js";
import {
  getAgentState,
  getAgentStateBase,
  requireAgentModel,
  setAgentState,
  setAgentStateBase,
  type AgentState,
} from "@agent/RuntimeState.js";
import { createAgentServices } from "@agent/AgentFactory.js";

/**
 * AgentState 公共入口。
 *
 * 关键点（中文）
 * - 这个模块负责 agent 启动装配、热重载协调与公共导出。
 * - 当前新的主概念是 `AgentState`，不再强调 host/runtime 宿主命名。
 * - `ExecutionContext` 与 plugin/service 端口也统一从这里桥接出去。
 */

export type { AgentStateBase, AgentState } from "@agent/RuntimeState.js";
export {
  getAgentState,
  getAgentStateBase,
  setAgentState,
  setAgentStateBase,
  requireAgentModel,
} from "@agent/RuntimeState.js";
export { getExecutionContext } from "@agent/ExecutionContext.js";

let promptRuntime: PromptRuntime | null = null;

/**
 * 原子更新 runtime.systems（同时覆盖 base + ready）。
 */
function applyRuntimeSystems(nextSystems: string[]): void {
  const currentBase = getAgentStateBase();
  const currentReady = (() => {
    try {
      return getAgentState();
    } catch {
      return null;
    }
  })();

  setAgentStateBase({
    ...currentBase,
    systems: nextSystems,
  });

  if (currentReady) {
    setAgentState({
      ...currentReady,
      systems: nextSystems,
    });
  }
}

/**
 * 停止 runtime 文件热重载监听。
 */
export function stopAgentHotReload(): void {
  if (!promptRuntime) return;
  promptRuntime.stop();
  promptRuntime = null;
}

/**
 * 启动 runtime 文件热重载监听（PROFILE.md / SOUL.md）。
 */
function startAgentHotReload(): void {
  stopAgentHotReload();
  const agent = getAgentState();
  promptRuntime = new PromptRuntime({
    rootPath: agent.rootPath,
    logger: agent.logger,
    getCurrentSystems: () => getAgentStateBase().systems,
    applySystems: (nextSystems) => {
      applyRuntimeSystems(nextSystems);
    },
  });
  promptRuntime.start();
}

/**
 * 初始化入口。
 */
export async function initAgentState(cwd: string): Promise<void> {
  stopAgentHotReload();

  const resolvedCwd = String(cwd || "").trim() || ".";
  const rootPath = path.resolve(resolvedCwd);

  defaultLogger.bindProjectRoot(rootPath);
  ensureRuntimeProjectReady(rootPath);

  const globalEnv = loadGlobalEnvFromStore();
  const projectEnv = loadAgentEnvSnapshot(rootPath);
  const config = loadDowncityConfig(rootPath, {
    projectEnv,
    globalEnv,
  });

  process.env.DC_AGENT_PATH = rootPath;
  process.env.DC_AGENT_NAME = String(config.name || path.basename(rootPath));

  setAgentStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems: [],
  });

  const systems = loadStaticSystems(rootPath);
  setAgentStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
  });

  const model = await createModel({
    config,
    getRequestContext,
  });

  const compactor = new SummaryCompactor({
    keepLastMessages: config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: config.context?.messages?.archiveOnCompact,
    compactRatio: config.context?.messages?.compactRatio,
  });

  const system = new PromptSystem({
    projectRoot: rootPath,
    getStaticSystemPrompts: () => getAgentStateBase().systems,
    getRuntime: () => getExecutionContext(),
    profile: "chat",
  });

  const runtimeRegistry = new SessionRuntimeStore({
    model,
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

  const sessionStore = new SessionStore({
    runtimeRegistry,
  });

  const pluginRegistry = createAgentPluginRegistry();
  const agentState: AgentState = {
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
    model,
    sessionStore,
    services: new Map(),
    pluginRegistry,
  };
  agentState.services = createAgentServices(agentState);

  setAgentState(agentState);
  setShellToolRuntime(getExecutionContext().invoke);
  startAgentHotReload();
}
