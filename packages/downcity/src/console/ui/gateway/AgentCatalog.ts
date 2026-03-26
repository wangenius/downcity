/**
 * Console UI agent 目录与状态辅助。
 *
 * 关键点（中文）
 * - 负责 agent 列表、选中逻辑、模型面板、配置文件状态等“只读聚合”能力。
 * - 不处理进程控制；启动/停止逻辑单独放到 AgentActions 中。
 */

import fs from "fs-extra";
import path from "node:path";
import { basename } from "node:path";
import { getDaemonLogPath, getDaemonMetaPath, isProcessAlive, readDaemonPid } from "@/console/daemon/Manager.js";
import {
  getProfileMdPath,
  getDowncityJsonPath,
  getDowncityMemoryIndexPath,
  getDowncitySchemaPath,
  getSoulMdPath,
} from "@/console/env/Paths.js";
import { isAgentProjectInitialized } from "@/console/project/AgentInitializer.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import {
  getConsoleAgentRegistryPath,
  getConsolePidPath,
  getConsoleShipDbPath,
  getConsoleUiPidPath,
} from "@/console/runtime/ConsolePaths.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  ConsoleUiConfigFileStatusItem,
  ConsoleUiConfigStatusResponse,
  ConsoleUiAgentDirectoryInspection,
} from "@/types/ConsoleUI.js";
import type {
  ConsoleUiChatChannelStatus,
  ConsoleUiDaemonMeta,
  ConsoleUiShipJson,
} from "@/types/ConsoleUiGateway.js";
import { ConsoleStore } from "@utils/store/index.js";

const DEFAULT_RUNTIME_PORT = 5314;
const DEFAULT_RUNTIME_HOST = "127.0.0.1";

/**
 * 从请求中读取当前指向的 agent id。
 */
export function readRequestedConsoleAgentId(request: Request): string {
  const requestUrl = new URL(request.url);
  const queryAgent = String(requestUrl.searchParams.get("agent") || "").trim();
  if (queryAgent) return queryAgent;
  const headerAgent = String(request.headers.get("x-city-agent") || "").trim();
  if (headerAgent) return headerAgent;
  return "";
}

function normalizeHost(input: unknown): string | undefined {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return undefined;
  if (value === "0.0.0.0" || value === "::") return "127.0.0.1";
  return value;
}

function normalizePort(input: unknown): number | undefined {
  const raw =
    typeof input === "number"
      ? input
      : Number.parseInt(String(input || "").trim(), 10);
  if (!Number.isFinite(raw) || Number.isNaN(raw)) return undefined;
  if (!Number.isInteger(raw) || raw < 1 || raw > 65535) return undefined;
  return raw;
}

function pickArgValue(args: string[], flag: string): string | undefined {
  const idx = args.findIndex((item) => item === flag);
  if (idx < 0) return undefined;
  const next = String(args[idx + 1] || "").trim();
  return next || undefined;
}

async function resolveRuntimeEndpoint(projectRoot: string): Promise<{
  host: string;
  port: number;
}> {
  let daemonArgHost: string | undefined;
  let daemonArgPort: number | undefined;

  try {
    const metaPath = getDaemonMetaPath(projectRoot);
    if (await fs.pathExists(metaPath)) {
      const meta = (await fs.readJson(metaPath)) as ConsoleUiDaemonMeta;
      const args = Array.isArray(meta.args) ? meta.args.map((x) => String(x)) : [];
      daemonArgHost = normalizeHost(pickArgValue(args, "--host"));
      daemonArgPort = normalizePort(pickArgValue(args, "--port"));
    }
  } catch {
    // ignore meta parse errors
  }

  return {
    host: daemonArgHost || DEFAULT_RUNTIME_HOST,
    port: daemonArgPort || DEFAULT_RUNTIME_PORT,
  };
}

async function resolveAgentChatProfiles(params: {
  baseUrl: string;
}): Promise<Array<{
  channel: string;
  linkState?: string;
  statusText?: string;
}>> {
  try {
    const upstreamUrl = new URL("/api/services/command", params.baseUrl).toString();
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        serviceName: "chat",
        command: "status",
        payload: {},
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json().catch(() => ({}))) as {
      success?: unknown;
      data?: {
        channels?: ConsoleUiChatChannelStatus[];
      };
    };
    const rows = Array.isArray(payload?.data?.channels) ? payload.data.channels : [];
    return rows
      .map((row) => {
        const channel = String(row?.channel || "").trim();
        if (!channel) return null;
        const running =
          typeof row?.running === "boolean"
            ? row.running
            : (() => {
                const linkState = String(row?.linkState || "").trim();
                return linkState === "connected" || linkState === "unknown";
              })();
        // 关键点（中文）：只展示已启动渠道，未启动渠道不进入侧边栏 chat 分组。
        if (!running) return null;
        const linkState = String(row?.linkState || "").trim();
        const statusText = String(row?.statusText || "").trim();
        return {
          channel,
          ...(linkState ? { linkState } : {}),
          ...(statusText ? { statusText } : {}),
        };
      })
      .filter(
        (
          item,
        ): item is {
          channel: string;
          linkState?: string;
          statusText?: string;
        } => item !== null,
      );
  } catch {
    return [];
  }
}

async function buildAgentOption(
  projectRoot: string,
  startedAt: string,
  updatedAt: string,
  stoppedAt?: string,
): Promise<ConsoleUiAgentOption | null> {
  const daemonPid = await readDaemonPid(projectRoot);
  const running = Boolean(daemonPid && isProcessAlive(daemonPid));
  const endpoint = await resolveRuntimeEndpoint(projectRoot);

  let displayName = basename(projectRoot);
  let ship: ConsoleUiShipJson | null = null;
  try {
    const shipPath = getDowncityJsonPath(projectRoot);
    if (await fs.pathExists(shipPath)) {
      ship = (await fs.readJson(shipPath)) as ConsoleUiShipJson;
      const name = String(ship?.name || "").trim();
      if (name) displayName = name;
    }
  } catch {
    // ignore
  }

  const chatProfiles = running
    ? await resolveAgentChatProfiles({
        baseUrl: `http://${endpoint.host}:${endpoint.port}`,
      })
    : [];

  return {
    id: projectRoot,
    name: displayName,
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
    primaryModelId: String(ship?.model?.primary || "").trim() || undefined,
  };
}

/**
 * 枚举 console 注册表中的所有 agent。
 */
export async function listKnownConsoleAgents(): Promise<ConsoleUiAgentOption[]> {
  const entries = await listConsoleAgents();
  const agents: ConsoleUiAgentOption[] = [];

  for (const entry of entries) {
    const projectRoot = path.resolve(String(entry.projectRoot || "").trim());
    if (!projectRoot) continue;
    const option = await buildAgentOption(
      projectRoot,
      String(entry.startedAt || ""),
      String(entry.updatedAt || ""),
      String(entry.stoppedAt || ""),
    );
    if (!option) continue;
    agents.push(option);
  }

  return agents.sort((a, b) => {
    const runningA = a.running === true ? 1 : 0;
    const runningB = b.running === true ? 1 : 0;
    if (runningA !== runningB) return runningB - runningA;
    return a.name.localeCompare(b.name);
  });
}

function selectAgentId(
  agents: ConsoleUiAgentOption[],
  requestedAgentId: string,
): string {
  const requested = String(requestedAgentId || "").trim();
  if (requested) {
    const requestedAgent = agents.find((agent) => agent.id === requested);
    if (requestedAgent?.running === true) return requested;
  }
  const running = agents.find((agent) => agent.running === true);
  if (running) return running.id;
  // 关键点（中文）：没有运行中 agent 时不返回历史/离线 id，避免 UI 持续请求并触发 503 噪音。
  return "";
}

/**
 * 构建 agent 列表响应。
 */
export async function buildConsoleUiAgentsResponse(params: {
  requestedAgentId: string;
  cityVersion: string;
}): Promise<ConsoleUiAgentsResponse> {
  const agents = await listKnownConsoleAgents();
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
export async function resolveSelectedConsoleAgent(
  requestedAgentId: string,
  cityVersion: string,
): Promise<ConsoleUiAgentOption | null> {
  const payload = await buildConsoleUiAgentsResponse({
    requestedAgentId,
    cityVersion,
  });
  if (!payload.selectedAgentId) return null;
  const selected = payload.agents.find((agent) => agent.id === payload.selectedAgentId);
  if (!selected || selected.running !== true) return null;
  return selected;
}

/**
 * 按 id 查找 agent，允许离线状态。
 */
export async function resolveConsoleAgentById(
  requestedAgentId: string,
): Promise<ConsoleUiAgentOption | null> {
  const targetId = String(requestedAgentId || "").trim();
  if (!targetId) return null;
  const agents = await listKnownConsoleAgents();
  return agents.find((item) => item.id === targetId) || null;
}

/**
 * 探测目录是否已具备 agent 运行条件。
 */
export async function inspectConsoleUiAgentDirectory(
  projectRoot: string,
): Promise<ConsoleUiAgentDirectoryInspection> {
  const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
  const shipPath = getDowncityJsonPath(normalizedRoot);
  const profilePath = getProfileMdPath(normalizedRoot);
  const hasShipJson = await fs.pathExists(shipPath);
  const hasProfileMd = await fs.pathExists(profilePath);
  const initialized = await isAgentProjectInitialized(normalizedRoot);
  const knownAgents = await listKnownConsoleAgents();
  const matched = knownAgents.find((item) => item.projectRoot === normalizedRoot) || null;

  let displayName = basename(normalizedRoot);
  let primaryModelId = "";
  if (hasShipJson) {
    try {
      const ship = (await fs.readJson(shipPath)) as ConsoleUiShipJson;
      displayName = String(ship?.name || "").trim() || displayName;
      primaryModelId = String(ship?.model?.primary || "").trim();
    } catch {
      // ignore parse failures
    }
  } else if (matched?.name) {
    displayName = matched.name;
  }

  return {
    projectRoot: normalizedRoot,
    initialized,
    hasShipJson,
    hasProfileMd,
    knownAgent: matched !== null,
    running: matched?.running === true,
    displayName,
    primaryModelId: primaryModelId || matched?.primaryModelId || undefined,
  };
}

/**
 * 构建 Global Model 面板响应。
 */
export async function buildConsoleUiModelResponse(params: {
  requestedAgentId: string;
  cityVersion: string;
}): Promise<{
  success: boolean;
  model: {
    primaryModelId: string;
    primaryModelName: string;
    providerKey: string;
    providerType: string;
    baseUrl: string;
    agentPrimaryModelId: string;
    availableModels: Array<{
      id: string;
      name: string;
      providerKey: string;
      providerType: string;
      isPaused: boolean;
    }>;
  };
}> {
  const selectedAgent = await resolveSelectedConsoleAgent(
    params.requestedAgentId,
    params.cityVersion,
  );
  let agentPrimaryModelId = "";
  if (selectedAgent) {
    try {
      const shipPath = getDowncityJsonPath(selectedAgent.projectRoot);
      if (await fs.pathExists(shipPath)) {
        const ship = (await fs.readJson(shipPath)) as ConsoleUiShipJson;
        agentPrimaryModelId = String(ship?.model?.primary || "").trim();
      }
    } catch {
      // ignore parse errors
    }
  }

  const store = new ConsoleStore();
  try {
    const models = store.listModels();
    const providers = await store.listProviders();
    const providerMap = new Map(providers.map((x) => [x.id, x] as const));
    const activeModel = agentPrimaryModelId
      ? models.find((x) => x.id === agentPrimaryModelId)
      : undefined;
    const providerKey = String(activeModel?.providerId || "").trim();
    const provider = providerKey ? providerMap.get(providerKey) : undefined;

    return {
      success: true,
      model: {
        primaryModelId: agentPrimaryModelId,
        primaryModelName: String(activeModel?.name || "").trim(),
        providerKey,
        providerType: String(provider?.type || "").trim(),
        baseUrl: String(provider?.baseUrl || "").trim(),
        agentPrimaryModelId,
        availableModels: models.map((model) => {
          const providerConfig = providerMap.get(model.providerId);
          return {
            id: model.id,
            name: model.name,
            providerKey: model.providerId,
            providerType: String(providerConfig?.type || "").trim(),
            isPaused: model.isPaused === true,
          };
        }),
      },
    };
  } finally {
    store.close();
  }
}

/**
 * 读取单个配置文件状态。
 */
export async function readConsoleUiConfigFileStatus(params: {
  key: string;
  scope: "console" | "agent";
  label: string;
  filePath: string;
}): Promise<ConsoleUiConfigFileStatusItem> {
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
    } catch {
      readable = false;
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
  } catch (error) {
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
export async function buildConsoleUiConfigStatusResponse(params: {
  requestedAgentId: string;
  cityVersion: string;
}): Promise<ConsoleUiConfigStatusResponse> {
  const selectedAgent = await resolveSelectedConsoleAgent(
    params.requestedAgentId,
    params.cityVersion,
  );

  const consoleChecks = await Promise.all([
    readConsoleUiConfigFileStatus({
      key: "ship_db",
      scope: "console",
      label: "Console downcity.db",
      filePath: getConsoleShipDbPath(),
    }),
    readConsoleUiConfigFileStatus({
      key: "console_pid",
      scope: "console",
      label: "Console PID",
      filePath: getConsolePidPath(),
    }),
    readConsoleUiConfigFileStatus({
      key: "ui_pid",
      scope: "console",
      label: "Console UI PID",
      filePath: getConsoleUiPidPath(),
    }),
    readConsoleUiConfigFileStatus({
      key: "agents_registry",
      scope: "console",
      label: "Agents Registry",
      filePath: getConsoleAgentRegistryPath(),
    }),
  ]);

  let agentChecks: ConsoleUiConfigFileStatusItem[] = [];
  if (selectedAgent) {
    const cwd = selectedAgent.projectRoot;
    agentChecks = await Promise.all([
      readConsoleUiConfigFileStatus({
        key: "profile_md",
        scope: "agent",
        label: "PROFILE.md",
        filePath: getProfileMdPath(cwd),
      }),
      readConsoleUiConfigFileStatus({
        key: "soul_md",
        scope: "agent",
        label: "SOUL.md",
        filePath: getSoulMdPath(cwd),
      }),
      readConsoleUiConfigFileStatus({
        key: "ship_json",
        scope: "agent",
        label: "Agent downcity.json",
        filePath: getDowncityJsonPath(cwd),
      }),
      readConsoleUiConfigFileStatus({
        key: "ship_schema",
        scope: "agent",
        label: ".downcity/schema/downcity.schema.json",
        filePath: getDowncitySchemaPath(cwd),
      }),
      readConsoleUiConfigFileStatus({
        key: "memory_index",
        scope: "agent",
        label: ".downcity/memory/index.sqlite",
        filePath: getDowncityMemoryIndexPath(cwd),
      }),
    ]);
  }

  return {
    success: true,
    selectedAgentId: selectedAgent?.id || "",
    selectedAgentName: selectedAgent?.name || "",
    items: [...consoleChecks, ...agentChecks],
  };
}
