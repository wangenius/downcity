/**
 * `town agent` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town agent` 在交互式终端里进入这里，而不是只输出静态 help。
 * - 保留原有脚本化子命令不变，只把高频的人类操作收敛成轻量 manager。
 */
import prompts from "prompts";
import fs from "fs-extra";
import { initCommand } from "./Init.js";
import { runCommand } from "./Run.js";
import { startCommand } from "./Start.js";
import { stopCommand } from "./Stop.js";
import { restartCommand } from "./Restart.js";
import { statusCommand } from "./Status.js";
import { chatCommand } from "./AgentChat.js";
import { listRegisteredAgentsForCli, resolveCliAgentStartProjectRoot, } from "./AgentSelection.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";
import { injectAgentContext } from "../shared/IndexSupport.js";
import { prepareForegroundAgent } from "../shared/TownAgentRuntime.js";
import { CliError } from "../shared/CliError.js";
import { getDowncityJsonPath } from "../config/Paths.js";
import { PlatformStore } from "../town/store/index.js";
const CHAT_CHANNELS = ["telegram", "feishu", "qq"];
function isInteractiveTerminal() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
async function loadAgentSummaries() {
    const agents = await listRegisteredAgentsForCli();
    return agents.map((agent) => {
        const config = readAgentConfig(agent.projectRoot);
        return {
            id: String(config?.id || "").trim() || agent.id,
            projectRoot: agent.projectRoot,
            status: agent.status,
            modelId: readAgentModelId(config),
            channels: readAgentChannelSummaries(config),
        };
    });
}
function readAgentConfig(projectRoot) {
    try {
        return fs.readJsonSync(getDowncityJsonPath(projectRoot));
    }
    catch {
        return null;
    }
}
function readAgentModelId(config) {
    return String(config?.execution?.type === "api" ? config.execution.modelId || "" : "").trim();
}
function readAgentChannelSummaries(config) {
    const accountsById = loadChannelAccountMap();
    const channels = config?.plugins?.chat?.channels || {};
    const summaries = [];
    for (const channel of CHAT_CHANNELS) {
        const channelConfig = channels[channel];
        const accountId = String(channelConfig?.channelAccountId || "").trim();
        const enabled = channelConfig?.enabled === true;
        if (!accountId && !enabled)
            continue;
        const account = accountId ? accountsById.get(accountId) : null;
        const accountLabel = account
            ? account.name
            : accountId
                ? `missing account ${accountId}`
                : "enabled, no account";
        summaries.push(`${channel}:${accountLabel}`);
    }
    return summaries;
}
function findDanglingChannelAccounts(config) {
    const accountsById = loadChannelAccountMap();
    const channels = config?.plugins?.chat?.channels || {};
    const dangling = [];
    for (const channel of CHAT_CHANNELS) {
        const accountId = String(channels[channel]?.channelAccountId || "").trim();
        if (!accountId)
            continue;
        if (accountsById.has(accountId))
            continue;
        dangling.push({ channel, accountId });
    }
    return dangling;
}
function loadChannelAccounts(channel) {
    const store = new PlatformStore();
    try {
        return store.listChannelAccountsSync(channel);
    }
    finally {
        store.close();
    }
}
function loadChannelAccountMap() {
    return new Map(loadChannelAccounts().map((account) => [account.id, account]));
}
function formatAgentListDescription(agent) {
    const model = agent.modelId || "no model";
    const channels = agent.channels.length > 0 ? agent.channels.join(", ") : "no channels";
    return `${agent.status} · model: ${model} · channels: ${channels}`;
}
async function emitAgentManagerList() {
    const agents = await loadAgentSummaries();
    if (agents.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "Agents",
            summary: "0 registered",
            note: "Run `town agent start <path>` once to register an agent with Town.",
        });
        return;
    }
    emitCliList({
        tone: "accent",
        title: "Agents",
        summary: `${agents.length} registered`,
        items: agents.map((agent) => ({
            tone: agent.status === "running" ? "success" : "info",
            title: agent.id,
            facts: [
                { label: "Status", value: agent.status },
                { label: "Model", value: agent.modelId || "not configured" },
                {
                    label: "Channels",
                    value: agent.channels.length > 0 ? agent.channels.join(", ") : "not connected",
                },
                { label: "Project", value: agent.projectRoot },
            ],
        })),
    });
}
async function promptRootAction() {
    const agents = await loadAgentSummaries();
    const runningCount = agents.filter((agent) => agent.status === "running").length;
    const response = (await prompts({
        type: "select",
        name: "action",
        message: "管理 Agent",
        choices: [
            {
                title: "查看 agents",
                description: `${agents.length} 个已登记，${runningCount} 个运行中`,
                value: "list",
            },
            {
                title: "创建 agent",
                description: "初始化一个 agent 项目",
                value: "create",
            },
            {
                title: "启动 agent",
                description: "启动当前目录或选择已登记 agent",
                value: "start",
            },
            {
                title: "管理 agent",
                description: "状态、名称、模型、渠道、启动、停止、聊天",
                value: "manage",
            },
            {
                title: "退出",
                description: "关闭 agent manager",
                value: "exit",
            },
        ],
        initial: 0,
    }));
    return response.action || null;
}
async function promptAgentProjectRoot() {
    const agents = await loadAgentSummaries();
    if (agents.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "No agents found",
            note: "运行 `town agent create` 创建项目，或运行 `town agent start <path>` 登记已有项目。",
        });
        return null;
    }
    const response = (await prompts({
        type: "select",
        name: "projectRoot",
        message: "选择要管理的 Agent",
        choices: agents.map((agent) => ({
            title: agent.id,
            description: `${formatAgentListDescription(agent)} · ${agent.projectRoot}`,
            value: agent.projectRoot,
        })),
        initial: 0,
    }));
    const projectRoot = String(response.projectRoot || "").trim();
    if (!projectRoot)
        return null;
    return agents.find((agent) => agent.projectRoot === projectRoot) || null;
}
async function promptAgentAction(agent) {
    const response = (await prompts({
        type: "select",
        name: "action",
        message: `管理 agent · ${agent.id}`,
        choices: [
            {
                title: "查看状态",
                description: formatAgentListDescription(agent),
                value: "status",
            },
            {
                title: "启动",
                description: "启动当前 agent daemon",
                value: "start",
            },
            {
                title: "停止",
                description: "停止当前 agent daemon",
                value: "stop",
            },
            {
                title: "重启",
                description: "重启当前 agent daemon",
                value: "restart",
            },
            {
                title: "聊天",
                description: "进入终端交互式对话",
                value: "chat",
            },
            {
                title: "配置 ID",
                description: `当前：${agent.id}`,
                value: "configureId",
            },
            {
                title: "连接聊天渠道",
                description: `当前：${agent.channels.length > 0 ? agent.channels.join(", ") : "未连接"}`,
                value: "connectChannels",
            },
            {
                title: "返回",
                description: "回到上一级菜单",
                value: "back",
            },
        ],
        initial: 0,
    }));
    return response.action || null;
}
async function promptCreateProjectPath() {
    const response = (await prompts({
        type: "text",
        name: "projectPath",
        message: "Agent 项目路径",
        initial: ".",
    }));
    if (response.projectPath === undefined)
        return null;
    return String(response.projectPath || ".").trim() || ".";
}
async function promptStartProjectPath() {
    const response = (await prompts({
        type: "text",
        name: "projectPath",
        message: "要启动的 Agent 项目路径",
        initial: ".",
    }));
    if (response.projectPath === undefined)
        return null;
    return String(response.projectPath || ".").trim() || ".";
}
async function startAgentProject(projectRoot) {
    const options = {};
    const prepared = await prepareForegroundAgent(projectRoot, options);
    if (prepared.shouldForeground) {
        await runCommand(prepared.projectRoot, prepared.options);
        return;
    }
    await startCommand(prepared.projectRoot, prepared.options);
}
async function runCreateFlow() {
    const projectPath = await promptCreateProjectPath();
    if (!projectPath) {
        emitCliBlock({
            tone: "info",
            title: "Agent create cancelled",
        });
        return;
    }
    await initCommand(projectPath, {});
}
async function runStartFlow() {
    let projectRoot;
    try {
        projectRoot = await resolveCliAgentStartProjectRoot();
    }
    catch (error) {
        if (error instanceof CliError && error.exitCode === 0)
            return;
        if (error instanceof CliError &&
            (error.message === "No registered agents" || error.message === "Agent path is required")) {
            const projectPath = await promptStartProjectPath();
            if (!projectPath) {
                emitCliBlock({
                    tone: "info",
                    title: "Agent start cancelled",
                });
                return;
            }
            projectRoot = projectPath;
        }
        else {
            throw error;
        }
    }
    await startAgentProject(projectRoot);
}
async function configureAgentId(agent) {
    const response = (await prompts({
        type: "text",
        name: "id",
        message: "Agent ID",
        initial: agent.id,
        validate: (value) => String(value || "").trim().length > 0 ? true : "Agent ID 不能为空",
    }));
    if (response.id === undefined) {
        emitCliBlock({
            tone: "info",
            title: "Agent id unchanged",
        });
        return agent;
    }
    const nextId = String(response.id || "").trim();
    if (nextId === agent.id) {
        emitCliBlock({
            tone: "info",
            title: "Agent id unchanged",
            summary: agent.id,
        });
        return agent;
    }
    const shipJsonPath = getDowncityJsonPath(agent.projectRoot);
    const raw = fs.readJsonSync(shipJsonPath);
    raw.id = nextId;
    await fs.writeJson(shipJsonPath, raw, { spaces: 2 });
    emitCliBlock({
        tone: "success",
        title: "Agent id updated",
        facts: [
            { label: "previous", value: agent.id },
            { label: "current", value: nextId },
            { label: "project", value: agent.projectRoot },
        ],
    });
    return {
        ...agent,
        id: nextId,
    };
}
function buildAccountTitle(account) {
    const identity = String(account.identity || "").trim();
    return identity ? `${account.name} (${identity})` : account.name;
}
async function promptChannelAccountId(params) {
    const accounts = loadChannelAccounts(params.channel);
    const choices = [
        {
            title: "不连接",
            description: `关闭 ${params.channel} 与当前 agent 的关联`,
            value: "",
        },
        ...accounts.map((account) => ({
            title: buildAccountTitle(account),
            description: account.id,
            value: account.id,
        })),
    ];
    const initial = Math.max(0, choices.findIndex((choice) => choice.value === params.currentAccountId));
    const response = (await prompts({
        type: "select",
        name: "accountId",
        message: `连接 ${params.channel} channel account`,
        choices,
        initial,
    }));
    if (response.accountId === undefined)
        return undefined;
    return String(response.accountId || "").trim() || null;
}
async function connectAgentChannels(agent) {
    const shipJsonPath = getDowncityJsonPath(agent.projectRoot);
    const raw = fs.readJsonSync(shipJsonPath);
    const chatConfig = ((raw.plugins ??= {}).chat ??= {});
    const channelConfigs = chatConfig.channels ??= {};
    const dangling = findDanglingChannelAccounts(raw);
    if (dangling.length > 0) {
        emitCliList({
            tone: "warning",
            title: "Dangling channel accounts",
            summary: `${dangling.length} found`,
            items: dangling.map((item) => ({
                title: item.channel,
                facts: [
                    {
                        label: "missing",
                        value: item.accountId,
                    },
                ],
            })),
        });
        for (const item of dangling) {
            const current = channelConfigs[item.channel];
            channelConfigs[item.channel] = {
                enabled: current?.enabled === true,
            };
        }
        await fs.writeJson(shipJsonPath, raw, { spaces: 2 });
        const nextConfig = readAgentConfig(agent.projectRoot);
        const cleanedAgent = {
            ...agent,
            channels: readAgentChannelSummaries(nextConfig),
        };
        emitCliBlock({
            tone: "success",
            title: "Dangling channel account links removed automatically",
            summary: cleanedAgent.channels.length > 0 ? cleanedAgent.channels.join(", ") : "none",
        });
        const allAccountsAfterCleanup = loadChannelAccounts();
        if (allAccountsAfterCleanup.length === 0) {
            emitCliBlock({
                tone: "info",
                title: "No Town channel accounts found",
                note: "已清理悬空关联。请先运行 `town chat`，选择“配置 channel”来配置 Telegram、Feishu 或 QQ account；agent 这里只做 connect。",
            });
            return cleanedAgent;
        }
        agent = cleanedAgent;
    }
    const allAccounts = loadChannelAccounts();
    if (allAccounts.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "No Town channel accounts found",
            note: "请先运行 `town chat`，选择“配置 channel”来配置 Telegram、Feishu 或 QQ account；agent 这里只做 connect。",
        });
        return agent;
    }
    for (const channel of CHAT_CHANNELS) {
        const currentConfig = channelConfigs[channel];
        const currentAccountId = String(currentConfig?.channelAccountId || "").trim();
        const nextAccountId = await promptChannelAccountId({
            channel,
            currentAccountId,
        });
        if (nextAccountId === undefined) {
            emitCliBlock({
                tone: "info",
                title: "Channel connection cancelled",
            });
            return agent;
        }
        if (nextAccountId === null) {
            channelConfigs[channel] = {
                enabled: false,
            };
            continue;
        }
        channelConfigs[channel] = {
            enabled: true,
            channelAccountId: nextAccountId,
        };
    }
    await fs.writeJson(shipJsonPath, raw, { spaces: 2 });
    const nextConfig = readAgentConfig(agent.projectRoot);
    const nextAgent = {
        ...agent,
        channels: readAgentChannelSummaries(nextConfig),
    };
    emitCliBlock({
        tone: "success",
        title: "Agent chat channels connected",
        summary: nextAgent.channels.length > 0 ? nextAgent.channels.join(", ") : "none",
        facts: [
            {
                label: "project",
                value: agent.projectRoot,
            },
        ],
    });
    return nextAgent;
}
async function runSelectedAgentManager() {
    let agent = await promptAgentProjectRoot();
    if (!agent)
        return;
    while (true) {
        const action = await promptAgentAction(agent);
        if (!action) {
            emitCliBlock({
                tone: "info",
                title: "Agent manager closed",
            });
            return;
        }
        if (action === "back")
            return;
        try {
            if (action === "status") {
                injectAgentContext(agent.projectRoot);
                await statusCommand(agent.projectRoot);
                continue;
            }
            if (action === "start") {
                await startAgentProject(agent.projectRoot);
                continue;
            }
            if (action === "stop") {
                await stopCommand(agent.projectRoot);
                continue;
            }
            if (action === "restart") {
                injectAgentContext(agent.projectRoot);
                await restartCommand(agent.projectRoot, {});
                continue;
            }
            if (action === "chat") {
                await chatCommand({ to: agent.id });
                continue;
            }
            if (action === "configureId") {
                agent = await configureAgentId(agent);
                continue;
            }
            if (action === "connectChannels") {
                agent = await connectAgentChannels(agent);
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Agent manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
/**
 * 运行 `town agent` 交互式管理器。
 */
export async function runInteractiveAgentManager() {
    if (!isInteractiveTerminal())
        return;
    while (true) {
        const action = await promptRootAction();
        if (!action || action === "exit") {
            emitCliBlock({
                tone: "info",
                title: "Agent manager closed",
            });
            return;
        }
        try {
            if (action === "list") {
                await emitAgentManagerList();
                continue;
            }
            if (action === "create") {
                await runCreateFlow();
                continue;
            }
            if (action === "start") {
                await runStartFlow();
                continue;
            }
            if (action === "manage") {
                await runSelectedAgentManager();
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Agent manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
//# sourceMappingURL=AgentManager.js.map