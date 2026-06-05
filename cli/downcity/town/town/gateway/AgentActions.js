/**
 * 平台 agent 动作辅助。
 *
 * 关键点（中文）
 * - 聚合 agent 进程控制、目录选择、命令执行等带副作用能力。
 * - 与只读目录查询分离，降低网关主入口复杂度。
 */
import { execFile, spawn } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import { startDaemonProcess, stopDaemonProcess, getDaemonLogPath, isProcessAlive, readDaemonPid, } from "@/process/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/process/daemon/CliArgs.js";
import { initializeAgentProject, isAgentProjectInitialized, } from "@downcity/agent";
import { getProfileMdPath, getDowncitySessionRootDirPath, getDowncityJsonPath, getDowncityDirPath, } from "@/config/Paths.js";
import { stripInvocationAuthEnv } from "@/town/auth/AuthEnv.js";
import { assertPlatformModelReady, assertProjectExecutionModelReady, } from "@/town/city-model/ExecutionModelBinding.js";
function resolveExecutionInput(params) {
    const modelId = String(params.modelId || "").trim();
    if (!modelId) {
        throw new Error("API execution requires modelId");
    }
    return {
        type: "api",
        modelId,
    };
}
function resolveManagedAgentIdFromProjectRoot(projectRoot) {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    const fallback = path.basename(normalizedRoot);
    const configPath = getDowncityJsonPath(normalizedRoot);
    try {
        const raw = fs.readJsonSync(configPath);
        const agentId = typeof raw.id === "string" ? raw.id.trim() : "";
        return agentId || fallback;
    }
    catch {
        return fallback;
    }
}
function resolveTaskIdFromTaskMdPath(task_md_path) {
    const text = String(task_md_path || "").trim();
    if (!text)
        return "";
    return path.basename(path.dirname(text));
}
function getDowncityTasksDirPath(project_root) {
    return path.join(getDowncityDirPath(project_root), "task");
}
function readTaskListFromPluginActionResult(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return [];
    const data = input.data;
    if (!data || typeof data !== "object" || Array.isArray(data))
        return [];
    const tasks = data.tasks;
    return Array.isArray(tasks) ? tasks : [];
}
/**
 * 初始化平台控制面选中的 agent 项目。
 */
export async function initializePlatformAgentProject(params) {
    const execution = resolveExecutionInput({
        modelId: params.modelId,
    });
    await assertPlatformModelReady(execution.modelId);
    return initializeAgentProject({
        projectRoot: params.projectRoot,
        id: String(params.id || "").trim() || undefined,
        execution,
        forceOverwriteShipJson: params.forceOverwriteShipJson === true,
    });
}
/**
 * 更新现有 agent 的执行绑定配置。
 */
export async function updatePlatformAgentExecution(params) {
    const projectRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
    const shipJsonPath = getDowncityJsonPath(projectRoot);
    if (!(await fs.pathExists(shipJsonPath))) {
        throw new Error(`downcity.json not found: ${shipJsonPath}`);
    }
    const ship = (await fs.readJson(shipJsonPath));
    const modelId = String(params.modelId || "").trim();
    if (!modelId) {
        throw new Error("modelId is required");
    }
    await assertPlatformModelReady(modelId);
    ship.execution = {
        type: "api",
        modelId,
    };
    await fs.writeJson(shipJsonPath, ship, { spaces: 2 });
    return {
        projectRoot,
        modelId,
    };
}
/**
 * 调起系统目录选择器。

/**
 * 调起系统目录选择器。
 */
export async function pickPlatformAgentDirectoryPath() {
    if (process.platform !== "darwin") {
        throw new Error("System directory picker is currently only supported on macOS.");
    }
    const script = 'POSIX path of (choose folder with prompt "Select Agent Project Directory")';
    const stdout = await new Promise((resolve, reject) => {
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
export async function executeAgentProjectShellCommand(params) {
    const command = String(params.command || "").trim();
    const cwd = path.resolve(String(params.cwd || "").trim() || ".");
    const timeoutMs = Math.max(1_000, Math.min(Number(params.timeoutMs || 45_000), 120_000));
    const startedAt = Date.now();
    return await new Promise((resolve, reject) => {
        const childEnv = {
            ...process.env,
            FORCE_COLOR: "0",
        };
        stripInvocationAuthEnv(childEnv);
        const child = spawn("/bin/zsh", ["-lc", command], {
            cwd,
            env: childEnv,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const MAX_OUTPUT_BYTES = 200_000;
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let killTimer = null;
        let hardKillTimer = null;
        // 关键点（中文）：超时先尝试 SIGTERM，仍未退出再兜底 SIGKILL。
        killTimer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            hardKillTimer = setTimeout(() => {
                child.kill("SIGKILL");
            }, 1_200);
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            if (!chunk)
                return;
            if (Buffer.byteLength(stdout, "utf-8") >= MAX_OUTPUT_BYTES)
                return;
            stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
            if (!chunk)
                return;
            if (Buffer.byteLength(stderr, "utf-8") >= MAX_OUTPUT_BYTES)
                return;
            stderr += String(chunk);
        });
        child.on("error", (error) => {
            if (settled)
                return;
            settled = true;
            if (killTimer)
                clearTimeout(killTimer);
            if (hardKillTimer)
                clearTimeout(hardKillTimer);
            reject(error);
        });
        child.on("close", (code, signal) => {
            if (settled)
                return;
            settled = true;
            if (killTimer)
                clearTimeout(killTimer);
            if (hardKillTimer)
                clearTimeout(hardKillTimer);
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
export async function startManagedAgentByProjectRoot(params) {
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
            throw new Error(`Project not ready: ${normalizedRoot}. Required files: PROFILE.md and downcity.json`);
        }
        const execution = resolveExecutionInput({
            modelId: params.initialization?.modelId,
        });
        await assertPlatformModelReady(execution.modelId);
        await initializeAgentProject({
            projectRoot: normalizedRoot,
            id: String(params.initialization?.id || "").trim() || undefined,
            execution,
            forceOverwriteShipJson: params.initialization?.forceOverwriteShipJson === true,
        });
    }
    else {
        const profilePath = getProfileMdPath(normalizedRoot);
        const shipPath = getDowncityJsonPath(normalizedRoot);
        if (!(await fs.pathExists(profilePath)) || !(await fs.pathExists(shipPath))) {
            throw new Error(`Project not ready: ${normalizedRoot}. Required files: PROFILE.md and downcity.json`);
        }
    }
    await assertProjectExecutionModelReady(normalizedRoot);
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
export async function inspectManagedAgentRestartSafety(params) {
    const normalizedRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
    const activeContexts = [];
    const activeTasks = [];
    const knownAgents = await params.listKnownAgents();
    const targetAgent = knownAgents.find((item) => path.resolve(String(item.projectRoot || "")) === normalizedRoot);
    const agentId = String(targetAgent?.agentId || "").trim()
        || resolveManagedAgentIdFromProjectRoot(normalizedRoot);
    const sessionRootDir = getDowncitySessionRootDirPath(normalizedRoot, agentId);
    if (await fs.pathExists(sessionRootDir)) {
        const entries = await fs.readdir(sessionRootDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const lockFilePath = path.join(sessionRootDir, entry.name, "messages", ".context.lock");
            if (!(await fs.pathExists(lockFilePath)))
                continue;
            try {
                activeContexts.push(decodeURIComponent(entry.name));
            }
            catch {
                activeContexts.push(entry.name);
            }
        }
    }
    if (targetAgent?.running === true && params.agentRpcPool) {
        try {
            const client = params.agentRpcPool.resolveClientForAgent(targetAgent);
            const payload = client
                ? await client.run_internal_plugin_action({
                    plugin_name: "task",
                    action_name: "list",
                    payload: {},
                })
                : null;
            const tasks = readTaskListFromPluginActionResult(payload);
            for (const task of tasks) {
                const title = String(task?.title || "").trim();
                const task_id = resolveTaskIdFromTaskMdPath(task?.taskMdPath);
                const timestamp = String(task?.lastRunTimestamp || "").trim();
                if (!title || !task_id || !timestamp)
                    continue;
                const progressPath = path.join(getDowncityTasksDirPath(normalizedRoot), task_id, timestamp, "run-progress.json");
                const progress = (await fs.readJson(progressPath).catch(() => null));
                if (String(progress?.status || "").trim().toLowerCase() === "running") {
                    activeTasks.push(title);
                }
            }
        }
        catch {
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
export async function restartManagedAgentByProjectRoot(params) {
    const normalizedRoot = path.resolve(String(params.projectRoot || "").trim() || ".");
    await stopDaemonProcess({ projectRoot: normalizedRoot }).catch(() => ({
        stopped: false,
    }));
    const started = await startManagedAgentByProjectRoot({
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
export async function stopManagedAgentByProjectRoot(projectRoot) {
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
//# sourceMappingURL=AgentActions.js.map