/**
 * AgentRuntime：agent 宿主装配与导出模块。
 *
 * 关键点（中文）
 * - 这里是单 agent 宿主的主装配入口，负责把 config、model、session、service、plugin 串起来。
 * - 完整运行态类型仍由 `AgentRuntimeState.ts` 维护；本模块只负责装配与对外导出。
 * - 该模块同时负责热重载提示词系统与导出统一的 `getAgentContext()` 入口。
 */

import path from "path";
import fs from "fs";
import { logger as defaultLogger } from "@shared/utils/logger/Logger.js";
import { LocalSessionExecutor } from "@session/executors/local/LocalSessionExecutor.js";
import { createModel } from "@/main/city/model/CreateModel.js";
import {
  loadGlobalEnvFromStore,
  loadAgentEnvSnapshot,
  loadDowncityConfig,
} from "@/main/city/env/Config.js";
import { getDowncityJsonPath } from "@/main/city/env/Paths.js";
import {
  getTaskRunDir,
  parseTaskRunSessionId,
} from "@services/task/runtime/Paths.js";
import { setShellToolRuntime, shellTools } from "@session/tools/shell/ShellToolDefinition.js";
import { getSessionRunScope } from "@session/SessionRunScope.js";
import { JsonlSessionHistoryComposer } from "@session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionCompactionComposer } from "@session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { DefaultSessionSystemComposer } from "@session/composer/system/default/DefaultSessionSystemComposer.js";
import { createLocalSessionMemoryRuntime } from "@session/executors/local/SessionMemoryRuntime.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { AcpSessionExecutor } from "@session/executors/acp/AcpSessionExecutor.js";
import { ChatSession } from "@services/chat/runtime/ChatSession.js";
import { ChatSessionExecutionComposer } from "@services/chat/runtime/ChatSessionExecutionComposer.js";
import {
  readEnabledSessionAgentConfig,
  resolveAcpLaunchConfig,
} from "@session/executors/acp/AcpLaunchConfig.js";
import { ensureRuntimeProjectReady } from "@/main/city/daemon/ProjectSetup.js";
import {
  loadStaticSystemPrompts,
  StaticPromptCatalog,
} from "@session/composer/system/default/StaticPromptCatalog.js";
import {
  getAgentContext,
} from "@/main/agent/AgentContext.js";
import {
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
  type AgentRuntime,
} from "@/main/agent/AgentRuntimeState.js";
import { createRegisteredServiceInstances } from "@/main/service/ServiceClassRegistry.js";
import { readProjectPrimaryModelId } from "@/main/agent/project/ProjectExecutionBinding.js";
import { initializePluginManager, resetPluginManager } from "@/main/plugin/PluginManager.js";
import {
  clearPluginRuntimeContextResolver,
  setPluginRuntimeContextResolver,
} from "@/main/city/runtime/PluginRuntime.js";
import {
  createAgentAuthRuntime,
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/main/city/runtime/AgentHostRuntime.js";
import { updateAgentRuntimeConfig } from "@/main/agent/AgentRuntimeState.js";

export type { AgentRuntimeBase, AgentRuntime } from "@/main/agent/AgentRuntimeState.js";
export {
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
  requireAgentModel,
} from "@/main/agent/AgentRuntimeState.js";
export { getAgentContext } from "@/main/agent/AgentContext.js";

let staticPromptCatalog: StaticPromptCatalog | null = null;
let configWatchPath: string | null = null;

/**
 * 原子更新 AgentRuntime.systems（同时覆盖 base + ready）。
 */
function applyAgentSystems(nextSystems: string[]): void {
  const currentBase = getAgentRuntimeBase();
  const currentReady = (() => {
    try {
      return getAgentRuntime();
    } catch {
      return null;
    }
  })();

  setAgentRuntimeBase({
    ...currentBase,
    systems: nextSystems,
  });

  if (currentReady) {
    setAgentRuntime({
      ...currentReady,
      systems: nextSystems,
    });
  }
}

/**
 * 停止 agent 提示词文件热重载监听。
 */
export function stopAgentHotReload(): void {
  if (staticPromptCatalog) {
    staticPromptCatalog.stop();
    staticPromptCatalog = null;
  }
  if (configWatchPath) {
    fs.unwatchFile(configWatchPath);
    configWatchPath = null;
  }
  clearPluginRuntimeContextResolver();
}

/**
 * 刷新当前 agent 的项目配置快照。
 *
 * 关键点（中文）
 * - 这里只更新 `AgentRuntime.config`，不尝试重建长期运行对象。
 * - 适用于 plugin 启用态、prompt 注入、轻量配置读取这类直接依赖 config 的链路。
 */
export function refreshAgentProjectConfig(): boolean {
  const currentBase = getAgentRuntimeBase();
  const nextConfig = loadDowncityConfig(currentBase.rootPath, {
    projectEnv: currentBase.env,
    globalEnv: currentBase.globalEnv,
  });
  const prevSerialized = JSON.stringify(currentBase.config);
  const nextSerialized = JSON.stringify(nextConfig);
  if (prevSerialized === nextSerialized) {
    return false;
  }
  updateAgentRuntimeConfig(nextConfig);
  return true;
}

/**
 * 启动 agent 提示词文件热重载监听（PROFILE.md / SOUL.md）。
 */
function startAgentHotReload(): void {
  stopAgentHotReload();
  const agent = getAgentRuntime();
  staticPromptCatalog = new StaticPromptCatalog({
    rootPath: agent.rootPath,
    logger: agent.logger,
    getCurrentSystems: () => getAgentRuntimeBase().systems,
    applySystems: (nextSystems) => {
      applyAgentSystems(nextSystems);
    },
  });
  staticPromptCatalog.start();

  const downcityJsonPath = getDowncityJsonPath(agent.rootPath);
  configWatchPath = downcityJsonPath;
  fs.watchFile(
    downcityJsonPath,
    {
      interval: 800,
      persistent: false,
    },
    () => {
      try {
        const changed = refreshAgentProjectConfig();
        if (changed) {
          agent.logger.info("Agent config reloaded", {
            rootPath: agent.rootPath,
            file: downcityJsonPath,
          });
        }
      } catch (error) {
        agent.logger.warn("Failed to reload agent config", {
          rootPath: agent.rootPath,
          file: downcityJsonPath,
          error: String(error),
        });
      }
    },
  );
}

/**
 * 初始化入口。
 */
export async function initAgentRuntime(cwd: string): Promise<void> {
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

  setAgentRuntimeBase({
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

  const systems = loadStaticSystemPrompts(rootPath);
  setAgentRuntimeBase({
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
          getSessionRunScope: getSessionRunScope,
        });

  const compactionComposer = new JsonlSessionCompactionComposer({
    keepLastMessages: config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: config.context?.messages?.archiveOnCompact,
    compactRatio: config.context?.messages?.compactRatio,
  });

  const systemComposer = new DefaultSessionSystemComposer({
    projectRoot: rootPath,
    getStaticSystemPrompts: () => getAgentRuntimeBase().systems,
    getContext: () => getAgentContext(),
    profile: "chat",
  });

  const sessionsById = new Map<string, ChatSession>();
  const getSession = (sessionId: string): ChatSession => {
    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error("AgentRuntime.getSession requires a non-empty sessionId");
    }
    const existing = sessionsById.get(key);
    if (existing) return existing;

    const historyComposer = createSessionHistoryComposer(rootPath, key);
    let created!: ChatSession;
    const executionComposer = new ChatSessionExecutionComposer({
      sessionId: key,
      getTools: () => shellTools,
      getTurnState: () => created.getTurnState(),
    });
    created = new ChatSession({
      sessionId: key,
      historyComposer,
      executionComposer,
      createExecutor: (
        sessionHistoryComposer: SessionHistoryComposer,
        chatExecutionComposer: ChatSessionExecutionComposer,
      ) =>
        sessionAgent
          ? new AcpSessionExecutor({
              rootPath,
              sessionId: key,
              logger: defaultLogger,
              historyComposer: sessionHistoryComposer,
              systemComposer,
              launch: resolveAcpLaunchConfig(sessionAgent),
            })
          : new LocalSessionExecutor({
              model: model as NonNullable<typeof model>,
              logger: defaultLogger,
              historyComposer: sessionHistoryComposer,
              compactionComposer,
              systemComposer,
              memoryRuntime: createLocalSessionMemoryRuntime({
                getContext: () => getAgentContext(),
              }),
              getTools: () => shellTools,
              executionComposer: chatExecutionComposer,
            }),
    });
    sessionsById.set(key, created);
    return created;
  };

  const agentState: AgentRuntime = {
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
    getSession,
    listExecutingSessionIds: () =>
      [...sessionsById.entries()]
        .filter(([, session]) => session.isExecuting())
        .map(([sessionId]) => sessionId),
    getExecutingSessionCount: () =>
      [...sessionsById.values()].filter((session) => session.isExecuting()).length,
    services: new Map(),
  };
  agentState.services = createRegisteredServiceInstances(agentState);

  setAgentRuntime(agentState);
  setPluginRuntimeContextResolver(() => getAgentContext());
  initializePluginManager();
  setShellToolRuntime(getAgentContext().invoke);
  startAgentHotReload();
}

function createSessionHistoryComposer(
  rootPath: string,
  sessionId: string,
): JsonlSessionHistoryComposer {
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
  return new JsonlSessionHistoryComposer({
    sessionId,
    rootPath,
    ...(paths ? { paths } : {}),
  });
}
