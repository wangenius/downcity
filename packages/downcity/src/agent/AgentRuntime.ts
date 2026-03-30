import path from "path";
import { logger as defaultLogger } from "@utils/logger/Logger.js";
import { SessionRegistry } from "@sessions/SessionRegistry.js";
import { SessionRuntimeRegistry } from "@sessions/SessionRuntimeRegistry.js";
import { createModel } from "@main/model/CreateModel.js";
import {
  loadGlobalEnvFromStore,
  loadAgentRuntimeEnv,
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
  getExecutionRuntime,
  getInvokeServicePort,
} from "@agent/ExecutionRuntime.js";
import {
  getAgentRuntime,
  getAgentRuntimeBase,
  requireExecutionModel,
  setAgentRuntime,
  setAgentRuntimeBase,
  setExecutionModel,
  type AgentRuntime,
} from "@agent/RuntimeState.js";
import { createAgentServices } from "@agent/AgentFactory.js";

/**
 * AgentRuntime 公共入口。
 *
 * 关键点（中文）
 * - 这个模块只负责进程启动、宿主装配、热重载协调。
 * - 宿主状态统一收敛到 `RuntimeState.ts`。
 * - execution runtime / plugin / service 端口统一收敛到 `ExecutionRuntime.ts`。
 * - 外部模块仍然从这里读取公共 API，保持入口简单稳定。
 */

export type { AgentRuntimeBase, AgentRuntime } from "@agent/RuntimeState.js";
export {
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
} from "@agent/RuntimeState.js";
export { getExecutionRuntime, getInvokeServicePort } from "@agent/ExecutionRuntime.js";

let promptRuntime: PromptRuntime | null = null;

/**
 * 原子更新 runtime.systems（同时覆盖 base + ready）。
 *
 * 关键点（中文）
 * - 热更新只允许替换 system 文本，不重建 session registry。
 * - 因为 `setAgentRuntimeBase` 会清空 ready，所以需要先缓存当前 ready 再恢复。
 */
function applyRuntimeSystems(nextSystems: string[]): void {
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
  const agent = getAgentRuntime();
  promptRuntime = new PromptRuntime({
    rootPath: agent.rootPath,
    logger: agent.logger,
    getCurrentSystems: () => getAgentRuntimeBase().systems,
    applySystems: (nextSystems) => {
      applyRuntimeSystems(nextSystems);
    },
  });
  promptRuntime.start();
}

/**
 * 初始化入口。
 *
 * 阶段说明（中文）
 * 1) 解析 rootPath + 绑定 logger 落盘目录
 * 2) 校验关键文件并确保 `.downcity` 目录结构
 * 3) 加载 env + downcity.json，建立 base runtime state
 * 4) 初始化模型、session registry、chat worker，建立 ready runtime state
 */
export async function initAgentRuntime(cwd: string): Promise<void> {
  stopAgentHotReload();

  const resolvedCwd = String(cwd || "").trim() || ".";
  const rootPath = path.resolve(resolvedCwd);

  // 关键点（中文）：logger 的落盘目录绑定到当前 agent 根目录，避免全局路径单例污染。
  defaultLogger.bindProjectRoot(rootPath);

  ensureRuntimeProjectReady(rootPath);

  const globalEnv = loadGlobalEnvFromStore();
  const projectEnv = loadAgentRuntimeEnv(rootPath);
  const config = loadDowncityConfig(rootPath, {
    projectEnv,
    globalEnv,
  });

  // 关键点（中文）：统一注入当前 agent 标识，供 shell/CLI 子命令默认解析。
  process.env.DC_AGENT_PATH = rootPath;
  process.env.DC_AGENT_NAME = String(config.name || path.basename(rootPath));

  setAgentRuntimeBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems: [],
  });

  const systems = loadStaticSystems(rootPath);
  setAgentRuntimeBase({
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
  });

  // 关键点（中文）：执行模型只维护一份，统一挂在 RuntimeState 中供 execution runtime 读取。
  setExecutionModel(null);
  setExecutionModel(
    await createModel({
      config,
      getRequestContext,
    }),
  );

  const compactor = new SummaryCompactor({
    keepLastMessages: config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: config.context?.messages?.archiveOnCompact,
    compactRatio: config.context?.messages?.compactRatio,
  });

  // 关键点（中文）：system 域逻辑全部收敛到 prompts/system，runtime 这里只做依赖注入。
  const system = new PromptSystem({
    projectRoot: rootPath,
    getStaticSystemPrompts: () => getAgentRuntimeBase().systems,
    getRuntime: () => getExecutionRuntime(),
    profile: "chat",
  });

  const runtimeRegistry = new SessionRuntimeRegistry({
    model: requireExecutionModel(),
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

  const sessionRegistry = new SessionRegistry({
    runtimeRegistry,
  });

  const agentRuntime: AgentRuntime = {
    cwd: resolvedCwd,
    rootPath,
    logger: defaultLogger,
    config,
    env: projectEnv,
    systems,
    sessionRegistry,
    services: new Map(),
  };
  agentRuntime.services = createAgentServices(agentRuntime);

  setAgentRuntime(agentRuntime);
  setShellToolRuntime({
    invokeService: (params) => getInvokeServicePort().invoke(params),
  });
  startAgentHotReload();
}
