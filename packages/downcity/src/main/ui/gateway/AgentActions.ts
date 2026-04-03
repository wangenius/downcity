/**
 * Console UI agent 动作辅助。
 *
 * 关键点（中文）
 * - 聚合 agent 进程控制、目录选择、命令执行等带副作用能力。
 * - 与只读目录查询分离，降低网关主入口复杂度。
 */

import { execFile, spawn } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import {
  startDaemonProcess,
  stopDaemonProcess,
  getDaemonLogPath,
  isProcessAlive,
  readDaemonPid,
} from "@/main/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/main/daemon/CliArgs.js";
import { ensureRuntimeExecutionBindingReady } from "@/main/daemon/ProjectSetup.js";
import {
  initializeAgentProject,
  isAgentProjectInitialized,
} from "@/main/project/AgentInitializer.js";
import {
  getProfileMdPath,
  getDowncitySessionRootDirPath,
  getDowncityJsonPath,
} from "@/main/env/Paths.js";
import type { ConsoleUiAgentOption } from "@/types/ConsoleUI.js";
import type { AgentProjectInitializationResult } from "@/types/AgentProject.js";
import type {
  ExecutionBindingConfig,
} from "@/types/ExecutionBinding.js";
import type { SessionAgentType } from "@/types/SessionAgent.js";

function resolveExecutionInput(params: {
  executionMode?: unknown;
  modelId?: unknown;
  agentType?: unknown;
}): ExecutionBindingConfig {
  const executionMode = String(params.executionMode || "").trim();
  if (executionMode === "acp") {
    const agentType = String(params.agentType || "").trim() as SessionAgentType;
    if (agentType !== "codex" && agentType !== "claude" && agentType !== "kimi") {
      throw new Error("ACP execution requires agentType: codex | claude | kimi");
    }
    return {
      type: "acp",
      agent: {
        type: agentType,
      },
    };
  }
  const modelId = String(params.modelId || "").trim();
  if (!modelId) {
    throw new Error("Model execution requires modelId");
  }
  return {
    type: "model",
    modelId,
  };
}

/**
 * 初始化 Console UI 选中的 agent 项目。
 */
export async function initializeConsoleUiAgentProject(params: {
  projectRoot: string;
  agentName?: unknown;
  executionMode?: unknown;
  modelId?: unknown;
  agentType?: unknown;
  forceOverwriteShipJson?: unknown;
}): Promise<AgentProjectInitializationResult> {
  return initializeAgentProject({
    projectRoot: params.projectRoot,
    agentName: String(params.agentName || "").trim() || undefined,
    execution: resolveExecutionInput({
      executionMode: params.executionMode,
      modelId: params.modelId,
      agentType: params.agentType,
    }),
    forceOverwriteShipJson: params.forceOverwriteShipJson === true,
  });
}

/**
 * 更新现有 agent 的执行绑定配置。
 */
export async function updateConsoleUiAgentExecution(params: {
  projectRoot: string;
  executionMode?: unknown;
  modelId?: unknown;
  agentType?: unknown;
}): Promise<{
  projectRoot: string;
  executionMode: "model" | "acp";
  modelId?: string;
  agentType?: SessionAgentType;
}> {
  const projectRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!(await fs.pathExists(shipJsonPath))) {
    throw new Error(`downcity.json not found: ${shipJsonPath}`);
  }
  const ship = (await fs.readJson(shipJsonPath)) as Record<string, unknown>;
  const execution = resolveExecutionInput({
    executionMode: params.executionMode,
    modelId: params.modelId,
    agentType: params.agentType,
  });
  ship.execution = execution;
  await fs.writeJson(shipJsonPath, ship, { spaces: 2 });
  return {
    projectRoot,
    executionMode: execution.type,
    ...(execution.type === "model" ? { modelId: execution.modelId } : {}),
    ...(execution.type === "acp" ? { agentType: execution.agent.type } : {}),
  };
}

/**
 * 调起系统目录选择器。
 */
export async function pickConsoleUiDirectoryPath(): Promise<string> {
  if (process.platform !== "darwin") {
    throw new Error("System directory picker is currently only supported on macOS.");
  }
  const script = 'POSIX path of (choose folder with prompt "Select Agent Project Directory")';
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("osascript", ["-e", script], (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(output || ""));
    });
  });
  const directoryPath = path.resolve(String(stdout || "").trim());
  if (!directoryPath) {
    throw new Error("No directory selected.");
  }
  return directoryPath;
}

/**
 * 在 agent 项目目录中执行 shell 命令。
 */
export async function executeConsoleUiShellCommand(params: {
  command: string;
  cwd: string;
  timeoutMs: number;
  authToken?: string;
}): Promise<{
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}> {
  const command = String(params.command || "").trim();
  const cwd = path.resolve(String(params.cwd || "").trim() || ".");
  const timeoutMs = Math.max(1_000, Math.min(Number(params.timeoutMs || 45_000), 120_000));
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-lc", command], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        ...(params.authToken ? { DC_AGENT_TOKEN: params.authToken } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const MAX_OUTPUT_BYTES = 200_000;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;
    let hardKillTimer: NodeJS.Timeout | null = null;

    // 关键点（中文）：超时先尝试 SIGTERM，仍未退出再兜底 SIGKILL。
    killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1_200);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (!chunk) return;
      if (Buffer.byteLength(stdout, "utf-8") >= MAX_OUTPUT_BYTES) return;
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      if (!chunk) return;
      if (Buffer.byteLength(stderr, "utf-8") >= MAX_OUTPUT_BYTES) return;
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve({
        command,
        cwd,
        exitCode: code,
        signal: signal || "",
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
      });
    });
  });
}

/**
 * 启动指定 agent。
 */
export async function startConsoleUiAgentByProjectRoot(params: {
  projectRoot: string;
  cliPath: string;
  initializeIfNeeded?: boolean;
  initialization?: {
    agentName?: unknown;
    executionMode?: unknown;
    modelId?: unknown;
    agentType?: unknown;
    forceOverwriteShipJson?: unknown;
  };
}): Promise<{
  success: boolean;
  projectRoot: string;
  started: boolean;
  pid?: number;
  logPath?: string;
  message?: string;
}> {
  const normalizedRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const daemonPid = await readDaemonPid(normalizedRoot);
  if (daemonPid && isProcessAlive(daemonPid)) {
    return {
      success: true,
      projectRoot: normalizedRoot,
      started: false,
      pid: daemonPid,
      logPath: getDaemonLogPath(normalizedRoot),
      message: "already_running",
    };
  }

  const projectReady = await isAgentProjectInitialized(normalizedRoot);
  if (!projectReady) {
    if (params.initializeIfNeeded !== true) {
      throw new Error(
        `Project not ready: ${normalizedRoot}. Required files: PROFILE.md and downcity.json`,
      );
    }
    await initializeAgentProject({
      projectRoot: normalizedRoot,
      agentName: String(params.initialization?.agentName || "").trim() || undefined,
      execution: resolveExecutionInput({
        executionMode: params.initialization?.executionMode,
        modelId: params.initialization?.modelId,
        agentType: params.initialization?.agentType,
      }),
      forceOverwriteShipJson: params.initialization?.forceOverwriteShipJson === true,
    });
  } else {
    const profilePath = getProfileMdPath(normalizedRoot);
    const shipPath = getDowncityJsonPath(normalizedRoot);
    if (!(await fs.pathExists(profilePath)) || !(await fs.pathExists(shipPath))) {
      throw new Error(
        `Project not ready: ${normalizedRoot}. Required files: PROFILE.md and downcity.json`,
      );
    }
  }

  ensureRuntimeExecutionBindingReady(normalizedRoot);
  const args = await buildRunArgsFromOptions(normalizedRoot, {});
  const started = await startDaemonProcess({
    projectRoot: normalizedRoot,
    cliPath: params.cliPath,
    args,
  });
  return {
    success: true,
    projectRoot: normalizedRoot,
    started: true,
    pid: started.pid,
    logPath: started.logPath,
    message: "started",
  };
}

/**
 * 检查 agent 重启/停止前是否存在运行中工作负载。
 */
export async function inspectConsoleUiAgentRestartSafety(params: {
  projectRoot: string;
  listKnownAgents: () => Promise<ConsoleUiAgentOption[]>;
}): Promise<{
  activeContexts: string[];
  activeTasks: string[];
}> {
  const normalizedRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  const activeContexts: string[] = [];
  const activeTasks: string[] = [];

  const sessionRootDir = getDowncitySessionRootDirPath(normalizedRoot);
  if (await fs.pathExists(sessionRootDir)) {
    const entries = await fs.readdir(sessionRootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lockFilePath = path.join(sessionRootDir, entry.name, "messages", ".context.lock");
      if (!(await fs.pathExists(lockFilePath))) continue;
      try {
        activeContexts.push(decodeURIComponent(entry.name));
      } catch {
        activeContexts.push(entry.name);
      }
    }
  }

  const knownAgents = await params.listKnownAgents();
  const targetAgent = knownAgents.find(
    (item) => path.resolve(String(item.projectRoot || "")) === normalizedRoot,
  );
  if (targetAgent?.running === true && targetAgent.baseUrl) {
    try {
      const tasksUrl = new URL("/api/dashboard/tasks", targetAgent.baseUrl).toString();
      const tasksResponse = await fetch(tasksUrl);
      if (tasksResponse.ok) {
        const payload = (await tasksResponse.json().catch(() => ({}))) as {
          tasks?: Array<{ title?: unknown }>;
        };
        const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
        for (const task of tasks) {
          const title = String(task?.title || "").trim();
          if (!title) continue;
          const runsUrl = new URL(
            `/api/dashboard/tasks/${encodeURIComponent(title)}/runs?limit=1`,
            targetAgent.baseUrl,
          ).toString();
          const runsResponse = await fetch(runsUrl);
          if (!runsResponse.ok) continue;
          const runsPayload = (await runsResponse.json().catch(() => ({}))) as {
            runs?: Array<{ inProgress?: unknown }>;
          };
          const firstRun = Array.isArray(runsPayload.runs) ? runsPayload.runs[0] : null;
          if (firstRun?.inProgress === true) {
            activeTasks.push(title);
          }
        }
      }
    } catch {
      // ignore runtime check failures
    }
  }

  return {
    activeContexts: Array.from(new Set(activeContexts)),
    activeTasks: Array.from(new Set(activeTasks)),
  };
}

/**
 * 重启指定 agent。
 */
export async function restartConsoleUiAgentByProjectRoot(params: {
  projectRoot: string;
  cliPath: string;
}): Promise<{
  success: boolean;
  projectRoot: string;
  restarted: boolean;
  pid?: number;
  logPath?: string;
  message?: string;
}> {
  const normalizedRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
  await stopDaemonProcess({ projectRoot: normalizedRoot }).catch(() => ({
    stopped: false,
  }));
  const started = await startConsoleUiAgentByProjectRoot({
    projectRoot: normalizedRoot,
    cliPath: params.cliPath,
  });
  return {
    success: true,
    projectRoot: normalizedRoot,
    restarted: true,
    pid: started.pid,
    logPath: started.logPath,
    message: "restarted",
  };
}

/**
 * 停止指定 agent。
 */
export async function stopConsoleUiAgentByProjectRoot(projectRoot: string): Promise<{
  success: boolean;
  projectRoot: string;
  stopped: boolean;
  pid?: number;
  message?: string;
}> {
  const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
  const result = await stopDaemonProcess({ projectRoot: normalizedRoot });
  return {
    success: true,
    projectRoot: normalizedRoot,
    stopped: result.stopped === true,
    pid: result.pid,
    message: result.stopped ? "stopped" : "already_stopped",
  };
}
