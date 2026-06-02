/**
 * 平台 agent 目录与状态辅助。
 *
 * 关键点（中文）
 * - 负责 agent 列表、选中逻辑、模型面板、配置文件状态等“只读聚合”能力。
 * - 不处理进程控制；启动 / 停止逻辑单独放到 AgentActions 中。
 */
import fs from "fs-extra";
import path from "node:path";
import { basename } from "node:path";
import { getDaemonLogPath, getDaemonMetaPath, isProcessAlive, readDaemonPid, } from "../../process/daemon/Manager.js";
import { getProfileMdPath, getDowncityJsonPath, getDowncitySchemaPath, getSoulMdPath, getDowncityMemoryLongTermPath, } from "../../config/Paths.js";
import { isAgentProjectInitialized } from "@downcity/agent";
import { listManagedAgentEntries } from "../../process/registry/TownRegistry.js";
import { getManagedAgentRegistryPath, getTownPidPath, getControlPlanePidPath, getPlatformStoreDbPath, } from "../../process/registry/TownPaths.js";
import { listCityAiServiceModelsForUser } from "../../model/runtime/CityAiServiceBinding.js";
const DEFAULT_RUNTIME_HOST = "127.0.0.1";
const DEFAULT_RUNTIME_PORT = 5314;
/**
 * 从请求中读取当前指向的 agent id。
 */
export function readRequestedPlatformAgentId(request) {
    const requestUrl = new URL(request.url);
    const queryAgent = String(requestUrl.searchParams.get("agent") || "").trim();
    if (queryAgent)
        return queryAgent;
    const headerAgent = String(request.headers.get("x-town-agent") || "").trim();
    if (headerAgent)
        return headerAgent;
    return "";
}
function normalizeHost(input) {
    const value = typeof input === "string" ? input.trim() : "";
    if (!value)
        return undefined;
    if (value === "0.0.0.0" || value === "::")
        return "127.0.0.1";
    return value;
}
function normalizePort(input) {
    const raw = typeof input === "number"
        ? input
        : Number.parseInt(String(input || "").trim(), 10);
    if (!Number.isFinite(raw) || Number.isNaN(raw))
        return undefined;
    if (!Number.isInteger(raw) || raw < 1 || raw > 65535)
        return undefined;
    return raw;
}
function pickArgValue(args, flag) {
    const idx = args.findIndex((item) => item === flag);
    if (idx < 0)
        return undefined;
    const next = String(args[idx + 1] || "").trim();
    return next || undefined;
}
async function resolveRuntimeEndpoint(projectRoot) {
    let daemonArgHost;
    let daemonArgPort;
    try {
        const metaPath = getDaemonMetaPath(projectRoot);
        if (await fs.pathExists(metaPath)) {
            const meta = (await fs.readJson(metaPath));
            const args = Array.isArray(meta.args) ? meta.args.map((x) => String(x)) : [];
            daemonArgHost = normalizeHost(pickArgValue(args, "--host"));
            daemonArgPort = normalizePort(pickArgValue(args, "--port"));
        }
    }
    catch {
        // ignore meta parse errors
    }
    return {
        host: daemonArgHost || DEFAULT_RUNTIME_HOST,
        port: daemonArgPort || DEFAULT_RUNTIME_PORT,
    };
}
async function resolveAgentChatProfiles(params) {
    try {
        const upstreamUrl = new URL("/api/plugins/command", params.baseUrl).toString();
        const response = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                pluginName: "chat",
                command: "status",
                payload: {},
            }),
        });
        if (!response.ok)
            return [];
        const payload = (await response.json().catch(() => ({})));
        const rows = Array.isArray(payload?.data?.channels) ? payload.data.channels : [];
        return rows
            .map((row) => {
            const channel = String(row?.channel || "").trim();
            if (!channel)
                return null;
            const running = typeof row?.running === "boolean"
                ? row.running
                : (() => {
                    const linkState = String(row?.linkState || "").trim();
                    return linkState === "connected" || linkState === "unknown";
                })();
            // 关键点（中文）：只展示已启动渠道，未启动渠道不进入侧边栏 chat 分组。
            if (!running)
                return null;
            const linkState = String(row?.linkState || "").trim();
            const statusText = String(row?.statusText || "").trim();
            return {
                channel,
                ...(linkState ? { linkState } : {}),
                ...(statusText ? { statusText } : {}),
            };
        })
            .filter((item) => item !== null);
    }
    catch {
        return [];
    }
}
async function buildAgentOption(projectRoot, startedAt, updatedAt, stoppedAt) {
    const daemonPid = await readDaemonPid(projectRoot);
    const running = Boolean(daemonPid && isProcessAlive(daemonPid));
    const endpoint = await resolveRuntimeEndpoint(projectRoot);
    let agentId = basename(projectRoot);
    let ship = null;
    try {
        const shipPath = getDowncityJsonPath(projectRoot);
        if (await fs.pathExists(shipPath)) {
            ship = (await fs.readJson(shipPath));
            const configuredAgentId = String(ship?.id || "").trim();
            if (configuredAgentId)
                agentId = configuredAgentId;
        }
    }
    catch {
        // ignore
    }
    const chatProfiles = running
        ? await resolveAgentChatProfiles({
            baseUrl: `http://${endpoint.host}:${endpoint.port}`,
        })
        : [];
    return {
        id: projectRoot,
        agentId,
        projectRoot,
        running,
        host: running ? endpoint.host : undefined,
        port: running ? endpoint.port : undefined,
        baseUrl: running ? `http://${endpoint.host}:${endpoint.port}` : undefined,
        startedAt,
        updatedAt,
        stoppedAt: String(stoppedAt || "").trim() || undefined,
        daemonPid: running ? daemonPid || undefined : undefined,
        logPath: running ? getDaemonLogPath(projectRoot) : undefined,
        chatProfiles,
        modelId: ship?.execution?.modelId && typeof ship.execution.modelId === "string" ? ship.execution.modelId.trim() || undefined : undefined,
    };
}
/**
 * 枚举平台控制面注册表中的所有 agent。
 */
export async function listKnownPlatformAgents() {
    const entries = await listManagedAgentEntries();
    const agents = [];
    for (const entry of entries) {
        const projectRoot = path.resolve(String(entry.projectRoot || "").trim());
        if (!projectRoot)
            continue;
        const option = await buildAgentOption(projectRoot, String(entry.startedAt || ""), String(entry.updatedAt || ""), String(entry.stoppedAt || ""));
        if (!option)
            continue;
        agents.push(option);
    }
    return agents.sort((a, b) => {
        const runningA = a.running === true ? 1 : 0;
        const runningB = b.running === true ? 1 : 0;
        if (runningA !== runningB)
            return runningB - runningA;
        return a.agentId.localeCompare(b.agentId);
    });
}
function selectAgentId(agents, requestedAgentId) {
    const requested = String(requestedAgentId || "").trim();
    if (requested) {
        const requestedAgent = agents.find((agent) => agent.id === requested);
        if (requestedAgent?.running === true)
            return requested;
    }
    const running = agents.find((agent) => agent.running === true);
    if (running)
        return running.id;
    // 关键点（中文）：没有运行中 agent 时不返回历史 / 离线 id，避免 UI 持续请求并触发 503 噪音。
    return "";
}
/**
 * 构建 agent 列表响应。
 */
export async function buildPlatformAgentsResponse(params) {
    const agents = await listKnownPlatformAgents();
    const selectedAgentId = selectAgentId(agents, params.requestedAgentId);
    return {
        success: true,
        cityVersion: params.cityVersion,
        agents,
        selectedAgentId,
    };
}
/**
 * 解析当前选中的运行中 agent。
 */
export async function resolveSelectedPlatformAgent(requestedAgentId, cityVersion) {
    const payload = await buildPlatformAgentsResponse({
        requestedAgentId,
        cityVersion,
    });
    if (!payload.selectedAgentId)
        return null;
    const selected = payload.agents.find((agent) => agent.id === payload.selectedAgentId);
    if (!selected || selected.running !== true)
        return null;
    return selected;
}
/**
 * 按 id 查找 agent，允许离线状态。
 */
export async function resolvePlatformAgentById(requestedAgentId) {
    const targetId = String(requestedAgentId || "").trim();
    if (!targetId)
        return null;
    const agents = await listKnownPlatformAgents();
    const normalizedTargetRoot = path.resolve(targetId);
    return (agents.find((item) => item.id === targetId ||
        item.agentId === targetId ||
        item.projectRoot === targetId ||
        item.projectRoot === normalizedTargetRoot) || null);
}
/**
 * 探测目录是否已具备 agent 运行条件。
 */
export async function inspectPlatformAgentDirectory(projectRoot) {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    const shipPath = getDowncityJsonPath(normalizedRoot);
    const profilePath = getProfileMdPath(normalizedRoot);
    const hasShipJson = await fs.pathExists(shipPath);
    const hasProfileMd = await fs.pathExists(profilePath);
    const initialized = await isAgentProjectInitialized(normalizedRoot);
    const knownAgents = await listKnownPlatformAgents();
    const matched = knownAgents.find((item) => item.projectRoot === normalizedRoot) || null;
    let agentId = basename(normalizedRoot);
    let modelId = "";
    if (hasShipJson) {
        try {
            const ship = (await fs.readJson(shipPath));
            agentId = String(ship?.id || "").trim() || agentId;
            modelId = String(ship?.execution?.modelId || "").trim();
        }
        catch {
            // ignore parse failures
        }
    }
    else if (matched?.agentId) {
        agentId = matched.agentId;
    }
    return {
        projectRoot: normalizedRoot,
        initialized,
        hasShipJson,
        hasProfileMd,
        knownAgent: matched !== null,
        running: matched?.running === true,
        ...(agentId ? { agentId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}
/**
 * 构建 City AIService Model 面板响应。
 *
 * 关键点（中文）
 * - 读取当前选中 agent 的 `execution.modelId`，再去 City AIService 模型目录补全展示信息。
 * - Town 这里只返回可绑定模型视图，不维护 provider/model 配置。
 */
export async function buildPlatformModelResponse(params) {
    const selectedAgent = await resolveSelectedPlatformAgent(params.requestedAgentId, params.cityVersion);
    let agentPrimaryModelId = "";
    if (selectedAgent) {
        try {
            const shipPath = getDowncityJsonPath(selectedAgent.projectRoot);
            if (await fs.pathExists(shipPath)) {
                const ship = (await fs.readJson(shipPath));
                agentPrimaryModelId = String(ship?.execution?.modelId || "").trim();
            }
        }
        catch {
            // ignore parse errors
        }
    }
    const models = await listCityAiServiceModelsForUser();
    const activeModel = agentPrimaryModelId
        ? models.find((x) => x.id === agentPrimaryModelId)
        : null;
    return {
        success: true,
        model: {
            primaryModelId: agentPrimaryModelId,
            primaryModelName: String(activeModel?.name || "").trim(),
            providerKey: "city",
            providerType: "ai-service",
            baseUrl: "City AIService",
            agentPrimaryModelId,
            availableModels: models.map((model) => ({
                id: model.id,
                name: model.name,
                providerKey: "city",
                providerType: model.modalities.join("/") || "ai-service",
                isPaused: false,
            })),
        },
    };
}
/**
 * 读取单个配置文件状态。
 */
export async function readPlatformConfigFileStatus(params) {
    const filePath = path.resolve(String(params.filePath || ""));
    if (!filePath) {
        return {
            key: params.key,
            scope: params.scope,
            label: params.label,
            path: String(params.filePath || ""),
            exists: false,
            isFile: false,
            readable: false,
            sizeBytes: 0,
            mtime: "",
            status: "error",
            reason: "invalid_path",
        };
    }
    try {
        const stat = await fs.stat(filePath);
        const isFile = stat.isFile();
        if (!isFile) {
            return {
                key: params.key,
                scope: params.scope,
                label: params.label,
                path: filePath,
                exists: true,
                isFile: false,
                readable: false,
                sizeBytes: Number(stat.size || 0),
                mtime: stat.mtime.toISOString(),
                status: "error",
                reason: "not_a_file",
            };
        }
        let readable = true;
        try {
            await fs.access(filePath, fs.constants.R_OK);
        }
        catch {
        }
        return {
            key: params.key,
            scope: params.scope,
            label: params.label,
            path: filePath,
            exists: true,
            isFile: true,
            readable,
            sizeBytes: Number(stat.size || 0),
            mtime: stat.mtime.toISOString(),
            status: readable ? "ok" : "error",
            reason: readable ? "ok" : "permission_denied",
        };
    }
    catch (error) {
        const message = String(error || "").toLowerCase();
        const missing = message.includes("enoent");
        return {
            key: params.key,
            scope: params.scope,
            label: params.label,
            path: filePath,
            exists: false,
            isFile: false,
            readable: false,
            sizeBytes: 0,
            mtime: "",
            status: missing ? "missing" : "error",
            reason: missing ? "file_not_found" : "stat_failed",
        };
    }
}
/**
 * 构建配置状态响应。
 */
export async function buildPlatformConfigStatusResponse(params) {
    const selectedAgent = await resolveSelectedPlatformAgent(params.requestedAgentId, params.cityVersion);
    const platformChecks = await Promise.all([
        readPlatformConfigFileStatus({
            key: "platform_store_db",
            scope: "platform",
            label: "Platform downcity.db",
            filePath: getPlatformStoreDbPath(),
        }),
        readPlatformConfigFileStatus({
            key: "control_plane_pid",
            scope: "platform",
            label: "Control Plane PID",
            filePath: getControlPlanePidPath(),
        }),
        readPlatformConfigFileStatus({
            key: "ui_pid",
            scope: "platform",
            label: "Town PID",
            filePath: getTownPidPath(),
        }),
        readPlatformConfigFileStatus({
            key: "agents_registry",
            scope: "platform",
            label: "Agents Registry",
            filePath: getManagedAgentRegistryPath(),
        }),
    ]);
    let agentChecks = [];
    if (selectedAgent) {
        const cwd = selectedAgent.projectRoot;
        agentChecks = await Promise.all([
            readPlatformConfigFileStatus({
                key: "profile_md",
                scope: "agent",
                label: "PROFILE.md",
                filePath: getProfileMdPath(cwd),
            }),
            readPlatformConfigFileStatus({
                key: "soul_md",
                scope: "agent",
                label: "SOUL.md",
                filePath: getSoulMdPath(cwd),
            }),
            readPlatformConfigFileStatus({
                key: "ship_json",
                scope: "agent",
                label: "Agent downcity.json",
                filePath: getDowncityJsonPath(cwd),
            }),
            readPlatformConfigFileStatus({
                key: "ship_schema",
                scope: "agent",
                label: ".downcity/schema/downcity.schema.json",
                filePath: getDowncitySchemaPath(cwd),
            }),
            readPlatformConfigFileStatus({
                key: "memory_index",
                scope: "agent",
                label: ".downcity/memory/MEMORY.md",
                filePath: getDowncityMemoryLongTermPath(cwd),
            }),
        ]);
    }
    return {
        success: true,
        selectedAgentId: selectedAgent?.id || "",
        selectedAgentProjectId: selectedAgent?.agentId || "",
        items: [...platformChecks, ...agentChecks],
    };
}
//# sourceMappingURL=AgentCatalog.js.map