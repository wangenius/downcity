/**
 * 前台启动 Agent 进程（当前终端进程内运行）。
 *
 * 场景
 * - `town agent start --foreground` 走这里（当前终端前台运行）
 * - daemon 子进程也复用这里作为真正运行入口
 *
 * 说明
 * - 后台常驻启动请使用 `town agent start`，并用
 *   `town agent restart` 管理。
 */
import path from "node:path";
import { Agent, loadDowncityConfig, loadStaticSystemPrompts, StaticPromptCatalog, } from "@downcity/agent";
import { Shell } from "@downcity/shell";
import { AgentHTTP, AgentRPC } from "@downcity/server";
import { CliError } from "../../shared/CliError.js";
import { createRuntimeModel } from "../town/city-model/CreateRuntimeModel.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "../env/ProcessEnv.js";
import { resolveAgentId } from "../../shared/IndexSupport.js";
import { startAgentHttpGateway } from "./AgentHttpGateway.js";
import { createTownBuiltinPlugins } from "../town/plugins/TownBuiltinPlugins.js";
/**
 * 前台启动入口（由 `agent start` 前台模式与内部 daemon 子进程复用）。
 *
 * 职责（中文）
 * - 初始化 agent 状态（配置、日志、services 依赖）
 * - 解析并合并启动参数（CLI > downcity.json > 默认值）
 * - 启动 agent 本机 RPC 与 Town 托管的 HTTP gateway（双端口）
 * - 启动 services（例如 task cron）
 * - 统一处理进程信号并优雅停机
 */
export async function runCommand(cwd = ".", options) {
    const projectRoot = path.resolve(cwd);
    const hostEnv = mergeProcessEnvWithPlatformGlobalEnv();
    // 端口解析（中文）：允许 number / string；空值返回 undefined 以便走配置回退链。
    const parsePort = (value, label) => {
        if (value === undefined || value === null || value === "")
            return undefined;
        const num = typeof value === "number" ? value : Number.parseInt(String(value), 10);
        if (!Number.isFinite(num) || Number.isNaN(num)) {
            throw new Error(`${label} must be a number`);
        }
        if (!Number.isInteger(num) || num <= 0 || num > 65535) {
            throw new Error(`${label} must be an integer between 1 and 65535`);
        }
        return num;
    };
    // Resolve startup options: CLI flags override built-in defaults.
    let port;
    let rpc_port;
    try {
        port = parsePort(options.port, "port") ?? 5314;
        rpc_port = parsePort(options.rpcPort, "rpcPort") ?? 15314;
    }
    catch (error) {
        throw new CliError({
            title: "Invalid start options",
            note: error instanceof Error ? error.message : String(error),
        });
    }
    if (port === rpc_port) {
        throw new CliError({
            title: "Invalid start options",
            note: "port and rpcPort must be different",
        });
    }
    const host = (options.host ?? "0.0.0.0").trim();
    const rpc_host = "127.0.0.1";
    const agentId = resolveAgentId(projectRoot);
    let currentSystems = loadStaticSystemPrompts(projectRoot);
    const config = loadDowncityConfig(projectRoot);
    const model = await createRuntimeModel({
        config,
        env: hostEnv,
    });
    const plugins = await createTownBuiltinPlugins({
        env: hostEnv,
    });
    const agent = new Agent({
        id: agentId,
        path: projectRoot,
        instruction: currentSystems,
        shell: new Shell(),
        plugins,
        model,
        env: hostEnv,
    });
    const promptCatalog = new StaticPromptCatalog({
        rootPath: projectRoot,
        logger: agent.getLogger(),
        getCurrentSystems: () => currentSystems,
        applySystems: (nextSystems) => {
            currentSystems = nextSystems;
            agent.setInstruction(nextSystems);
        },
    });
    promptCatalog.start();
    process.env.DC_BAY_PORT = String(port);
    process.env.DC_BAY_HOST = host;
    process.env.DC_AGENT_RPC_PORT = String(rpc_port);
    process.env.DC_AGENT_RPC_HOST = rpc_host;
    process.env.DC_AGENT_ID = agentId;
    process.env.DC_AGENT_PATH = projectRoot;
    // 关键点（中文）：等待 Agent 后台能力（plugin lifecycle / ActionSchedule）启动完成。
    await agent.ready();
    // 关键点（中文）：RPC transport 由 `@downcity/server` 提供，独立于 Agent 实例本身。
    const rpc = new AgentRPC(agent);
    await rpc.listen({ host: rpc_host, port: rpc_port });
    // 关键点（中文）：SDK HTTP transport 由 `@downcity/server` 提供子路由，挂到 town gateway 上。
    const agent_http = new AgentHTTP(agent);
    const server = await startAgentHttpGateway({
        host,
        port,
        getAgentContext: () => agent.getContext(),
        sdkRouter: agent_http.router(),
        getShell: () => agent.getShell(),
    });
    const agentLogger = agent.getLogger();
    // 处理进程信号
    // 停机顺序（中文）：HTTP gateway -> plugin runtimes / RPC server -> flush logs。
    let isShuttingDown = false;
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        agentLogger.info(`Received ${signal} signal, shutting down...`);
        promptCatalog.stop();
        await server.stop();
        await rpc.close();
        await agent.dispose();
        // Save logs
        await agentLogger.saveAllLogs();
        agentLogger.info("👋 Downcity town stopped");
        process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    agentLogger.info("=== Downcity Started ===");
}
//# sourceMappingURL=Run.js.map