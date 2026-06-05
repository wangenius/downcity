/**
 * Town Agent runtime 辅助模块。
 *
 * 关键点（中文）
 * - Town 负责本机 Agent 宿主能力，不能再从 City gateway 源码导入 helper。
 * - 这里只保留 Town 启动/列表/前台运行需要的最小运行态逻辑。
 * - City 管理命令仍通过 `city` 入口负责。
 */
import { resolve } from "node:path";
import { allocateAvailablePort } from "../process/daemon/PortAllocator.js";
import { getDaemonLogPath, isProcessAlive as isDaemonProcessAlive, readDaemonPid, } from "../process/daemon/Manager.js";
import { listManagedAgentEntries, markManagedAgentStopped, } from "../process/registry/TownRegistry.js";
import { isTownRunning } from "../process/registry/TownRuntime.js";
import { assertProjectExecutionModelReady } from "../town/city-model/ExecutionModelBinding.js";
import { CliError } from "./CliError.js";
import { injectAgentContext } from "./IndexSupport.js";
/**
 * 解析当前仍在运行的 managed agent。
 */
export async function resolveRunningManagedAgents(params) {
    const sync_registry = params?.syncRegistry !== false;
    const entries = await listManagedAgentEntries();
    const views = [];
    for (const entry of entries) {
        const project_root = resolve(String(entry.projectRoot || "").trim() || ".");
        const daemon_pid = await readDaemonPid(project_root);
        if (!daemon_pid || !isDaemonProcessAlive(daemon_pid)) {
            if (sync_registry) {
                await markManagedAgentStopped(project_root);
            }
            continue;
        }
        views.push({
            projectRoot: project_root,
            registeredPid: entry.pid,
            daemonPid: daemon_pid,
            running: true,
            startedAt: entry.startedAt,
            updatedAt: entry.updatedAt,
            logPath: getDaemonLogPath(project_root),
        });
    }
    return views.sort((left, right) => left.projectRoot.localeCompare(right.projectRoot));
}
/**
 * 确认目标 agent 已登记到 Town registry。
 */
export async function ensureRegisteredAgentProjectRoot(cwd) {
    const project_root = resolve(String(cwd || "."));
    const entries = await listManagedAgentEntries();
    const matched = entries.some((entry) => resolve(String(entry.projectRoot || "").trim() || ".") === project_root);
    if (matched)
        return project_root;
    throw new CliError({
        title: "Agent is not registered in managed agent registry",
        note: `project: ${project_root}`,
        fix: "town agent start <path>",
    });
}
/**
 * 为前台 agent 运行补齐上下文与模型绑定。
 */
export async function prepareForegroundAgent(cwd, options) {
    if (!(await isTownRunning())) {
        throw new CliError({
            title: "town runtime is not running",
            fix: "town start",
        });
    }
    injectAgentContext(cwd);
    const project_root = resolve(String(cwd || "."));
    await assertProjectExecutionModelReady(project_root);
    const should_foreground = options.foreground === true;
    if (!should_foreground) {
        return {
            projectRoot: project_root,
            options,
            shouldForeground: false,
        };
    }
    const host = String(options.host || "0.0.0.0").trim() || "0.0.0.0";
    const foreground_port = options.port !== undefined && options.port !== null && options.port !== ""
        ? options.port
        : await allocateAvailablePort({ host });
    return {
        projectRoot: project_root,
        shouldForeground: true,
        options: {
            ...options,
            host,
            port: foreground_port,
        },
    };
}
//# sourceMappingURL=TownAgentRuntime.js.map