import path from "path";
import { logger as defaultLogger } from "@shared/utils/logger/Logger.js";
import { SessionStore } from "@session/SessionStore.js";
import { SessionRuntimeStore } from "@session/SessionRuntimeStore.js";
import { createModel } from "@/city/runtime/model/CreateModel.js";
import {
  loadGlobalEnvFromStore,
  loadAgentEnvSnapshot,
  loadDowncityConfig,
} from "@/city/runtime/env/Config.js";
import {
  getTaskRunDir,
  parseTaskRunSessionId,
} from "@services/task/runtime/Paths.js";
import { setShellToolRuntime, shellTools } from "@session/tools/shell/Tool.js";
import { getRequestContext } from "@session/RequestContext.js";
import { FilePersistor } from "@session/runtime/FilePersistor.js";
import { SummaryCompactor } from "@session/runtime/SummaryCompactor.js";
import { PromptSystem } from "@session/prompts/system/PromptSystem.js";
import type { PersistorComponent } from "@session/components/PersistorComponent.js";
import { AcpSessionRuntime } from "@session/acp/AcpSessionRuntime.js";
import {
  readEnabledSessionAgentConfig,
  resolveAcpLaunchConfig,
} from "@session/acp/AcpSessionSupport.js";
import { ensureRuntimeProjectReady } from "@/city/runtime/daemon/ProjectSetup.js";
import {
  loadStaticSystems,
  PromptRuntime,
} from "@session/prompts/PromptRuntime.js";
import {
  getExecutionContext,
} from "@/city/runtime/agent/ExecutionContext.js";
import {
  getAgentState,
  getAgentStateBase,
  setAgentState,
  setAgentStateBase,
  type AgentState,
} from "@/city/runtime/agent/RuntimeState.js";
import { createRegisteredServiceInstances } from "@/city/service/ServiceClassRegistry.js";
import { readProjectPrimaryModelId } from "@/city/runtime/project/ProjectExecutionBinding.js";
import { initializePluginManager, resetPluginManager } from "@/city/plugin/PluginManager.js";
import {
  createAgentAuthRuntime,
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/city/runtime/console/AgentHostRuntime.js";

/**
 * AgentState 公共入口。
 *
 * 关键点（中文）
 * - 这个模块负责 agent 启动装配、热重载协调与公共导出。
 * - 当前新的主概念是 `AgentState`，不再强调 host/runtime 宿主命名。
 * - `ExecutionContext` 与 plugin/service 端口也统一从这里桥接出去。
 */

export type { AgentStateBase, AgentState } from "@/city/runtime/agent/RuntimeState.js";
export {
  getAgentState,
  getAgentStateBase,
  setAgentState,
  setAgentStateBase,
  requireAgentModel,
} from "@/city/runtime/agent/RuntimeState.js";
export { getExecutionContext } from "@/city/runtime/agent/ExecutionContext.js";

let promptRuntime: PromptRuntime | null = null;

/**
 * 原子更新 AgentState.systems（同时覆盖 base + ready）。
 */
function applyAgentSystems(nextSystems: string[]): void {
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
 * 停止 agent 提示词文件热重载监听。
 */
export function stopAgentHotReload(): void {
  if (!promptRuntime) return;
  promptRuntime.stop();
  promptRuntime = null;
}

/**
 * 启动 agent 提示词文件热重载监听（PROFILE.md / SOUL.md）。
 */
function startAgentHotReload(): void {
  stopAgentHotReload();
  const agent = getAgentState();
  promptRuntime = new PromptRuntime({
    rootPath: agent.rootPath,
    logger: agent.logger,
    getCurrentSystems: () => getAgentStateBase().systems,
    applySystems: (nextSystems) => {
      applyAgentSystems(nextSystems);
    },
  });
  promptRuntime.start();
}

/**
 * 初始化入口。
 */
export async function initAgentState(cwd: string): Promise<void> {
  stopAgentHotReload();
  resetPluginManager();

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
    globalEnv,
    systems: [],
    paths: createAgentPathRuntime(rootPath),
    auth: createAgentAuthRuntime(),
    pluginConfig: createAgentPluginConfigRuntime(rootPath),
  });

  const systems = loadStaticSystems(rootPath);
  setAgentStateBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    globalEnv,
    systems,
    paths: createAgentPathRuntime(rootPath),
    auth: createAgentAuthRuntime(),
    pluginConfig: createAgentPluginConfigRuntime(rootPath),
  });

  const sessionAgent = readEnabledSessionAgentConfig(config);
  const primaryModelId = readProjectPrimaryModelId(config);
  const model =
    sessionAgent || !primaryModelId
      ? undefined
      : await createModel({
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

  const runtimeRegistry = sessionAgent
    ? new SessionRuntimeStore({
        persistorStore: {
          getPersistor(sessionId: string) {
            return createSessionPersistor(rootPath, sessionId);
          },
        },
        createRuntime: ({
          sessionId,
          persistor,
        }: {
          sessionId: string;
          persistor: PersistorComponent;
        }) =>
          new AcpSessionRuntime({
            rootPath,
            sessionId,
            logger: defaultLogger,
            persistor,
            prompter: system,
            launch: resolveAcpLaunchConfig(sessionAgent),
          }),
      })
    : new SessionRuntimeStore({
        model: model as NonNullable<typeof model>,
        logger: defaultLogger,
        createPersistor: (sessionId: string) =>
          createSessionPersistor(rootPath, sessionId),
        compactor,
        system,
        getTools: () => shellTools,
      });

  const sessionStore = new SessionStore({
    runtimeRegistry,
  });

  const agentState: AgentState = {
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    globalEnv,
    systems,
    paths: createAgentPathRuntime(rootPath),
    auth: createAgentAuthRuntime(),
    pluginConfig: createAgentPluginConfigRuntime(rootPath),
    model,
    sessionStore,
    services: new Map(),
  };
  agentState.services = createRegisteredServiceInstances(agentState);

  setAgentState(agentState);
  initializePluginManager();
  setShellToolRuntime(getExecutionContext().invoke);
  startAgentHotReload();
}

function createSessionPersistor(rootPath: string, sessionId: string): FilePersistor {
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
        };
      })()
    : undefined;
  return new FilePersistor({
    sessionId,
    rootPath,
    ...(paths ? { paths } : {}),
  });
}
