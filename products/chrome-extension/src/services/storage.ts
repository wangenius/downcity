/**
 * 扩展设置存储服务。
 *
 * 关键点（中文）：
 * - `chrome.storage.sync` 保存非敏感配置：连接列表、默认连接、每连接默认路由、taskPrompt。
 * - `chrome.storage.local` 保存敏感配置：各连接 token、发送历史。
 * - 自动把旧版“单连接 + 全局 token + chatKey”结构迁移到新模型。
 */

import type {
  ExtensionServerConnection,
  ExtensionConnectionRoutePreference,
  ExtensionPageSendRecord,
  ExtensionServerProtocol,
  ExtensionServerConnectionSecretMap,
  ExtensionSettings,
} from "../types/extension";
import { normalizeAuthToken } from "./auth";

const SETTINGS_STORAGE_KEY = "downcity.extension.settings.v2";
const LEGACY_SETTINGS_STORAGE_KEY = "downcity.extension.settings.v1";
const SECRETS_STORAGE_KEY = "downcity.extension.server-secrets.v1";
const LEGACY_AUTH_STORAGE_KEY = "downcity.extension.auth.v1";
const SEND_HISTORY_STORAGE_KEY = "downcity.extension.send.history.v2";
const LEGACY_SEND_HISTORY_STORAGE_KEY = "downcity.extension.send.history.v1";
const SEND_HISTORY_MAX_COUNT = 120;
const DEFAULT_SERVER_PROTOCOL: ExtensionServerProtocol = "http";
const DEFAULT_SERVER_HOST = "127.0.0.1";
const DEFAULT_SERVER_PORT = 5315;
const DEFAULT_SERVER_BASE_PATH = "";
const DEFAULT_SERVER_CONNECTION_NAME = "Local Server";
const DEFAULT_TASK_PROMPT = "请阅读这个页面并给我一个可执行摘要。";

/**
 * 默认连接路由偏好。
 */
const DEFAULT_ROUTE_PREFERENCE: ExtensionConnectionRoutePreference = {
  agentId: "",
  sessionId: "",
};

function normalizeServerHost(input: unknown): string {
  const value = String(input || "").trim();
  return value || DEFAULT_SERVER_HOST;
}

function normalizeServerProtocol(input: unknown): ExtensionServerProtocol {
  return String(input || "").trim().toLowerCase() === "https" ? "https" : "http";
}

function normalizeServerBasePath(input: unknown): string {
  const value = String(input || "").trim();
  if (!value || value === "/") return DEFAULT_SERVER_BASE_PATH;
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function normalizeServerPort(input: unknown): number {
  const value =
    typeof input === "number"
      ? input
      : Number.parseInt(String(input || "").trim(), 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_SERVER_PORT;
  }
  if (value < 1 || value > 65535) return DEFAULT_SERVER_PORT;
  return Math.trunc(value);
}

function normalizeConnectionName(input: unknown, fallback: string): string {
  const value = String(input || "").replace(/\s+/g, " ").trim();
  return value || fallback;
}

function normalizeConnectionId(input: unknown): string {
  const value = String(input || "").trim();
  return value || "";
}

function createConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function toDefaultConnectionName(params: {
  host: string;
  port: number;
  protocol?: ExtensionServerProtocol;
  basePath?: string;
}): string {
  const host = normalizeServerHost(params.host);
  const port = normalizeServerPort(params.port);
  const protocol = normalizeServerProtocol(params.protocol);
  const basePath = normalizeServerBasePath(params.basePath);
  const target = `${protocol}://${host}:${port}${basePath}`;
  return target === `${DEFAULT_SERVER_PROTOCOL}://${DEFAULT_SERVER_HOST}:${DEFAULT_SERVER_PORT}${DEFAULT_SERVER_BASE_PATH}`
    ? DEFAULT_SERVER_CONNECTION_NAME
    : target;
}

function normalizeConnection(
  input: Partial<ExtensionServerConnection> | null | undefined,
): ExtensionServerConnection | null {
  if (!input || typeof input !== "object") return null;
  const host = normalizeServerHost(input.host);
  const protocol = normalizeServerProtocol(input.protocol);
  const port = normalizeServerPort(input.port);
  const basePath = normalizeServerBasePath(input.basePath);
  const id = normalizeConnectionId(input.id) || createConnectionId();
  return {
    id,
    name: normalizeConnectionName(
      input.name,
      toDefaultConnectionName({ host, port, protocol, basePath }),
    ),
    protocol,
    host,
    port,
    basePath,
  };
}

function normalizeRoutePreference(
  input: Partial<ExtensionConnectionRoutePreference> | null | undefined,
): ExtensionConnectionRoutePreference {
  return {
    agentId: String(input?.agentId || "").trim(),
    sessionId: String(input?.sessionId || "").trim(),
  };
}

function parseLegacyBaseUrl(input: unknown): {
  protocol: ExtensionServerProtocol;
  host: string;
  port: number;
  basePath: string;
} | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return {
      protocol: normalizeServerProtocol(parsed.protocol.replace(":", "")),
      host: normalizeServerHost(parsed.hostname),
      port: normalizeServerPort(parsed.port || DEFAULT_SERVER_PORT),
      basePath: normalizeServerBasePath(parsed.pathname),
    };
  } catch {
    return null;
  }
}

function buildDefaultConnection(params?: {
  id?: string;
  protocol?: unknown;
  host?: unknown;
  port?: unknown;
  basePath?: unknown;
  name?: unknown;
}): ExtensionServerConnection {
  const protocol = normalizeServerProtocol(params?.protocol);
  const host = normalizeServerHost(params?.host);
  const port = normalizeServerPort(params?.port);
  const basePath = normalizeServerBasePath(params?.basePath);
  return {
    id: normalizeConnectionId(params?.id) || createConnectionId(),
    name: normalizeConnectionName(
      params?.name,
      toDefaultConnectionName({ host, port, protocol, basePath }),
    ),
    protocol,
    host,
    port,
    basePath,
  };
}

/**
 * 默认设置。
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  connections: [buildDefaultConnection()],
  selectedConnectionId: "",
  routePreferences: {},
  taskPrompt: DEFAULT_TASK_PROMPT,
};

function normalizeSettings(
  input: Partial<ExtensionSettings> | null | undefined,
): ExtensionSettings {
  const rawConnections = Array.isArray(input?.connections) ? input.connections : [];
  const normalizedConnections: ExtensionServerConnection[] = [];
  const connectionIdSet = new Set<string>();

  for (const item of rawConnections) {
    const normalized = normalizeConnection(item);
    if (!normalized) continue;
    if (connectionIdSet.has(normalized.id)) continue;
    normalizedConnections.push(normalized);
    connectionIdSet.add(normalized.id);
  }

  if (normalizedConnections.length < 1) {
    const fallback = buildDefaultConnection();
    normalizedConnections.push(fallback);
    connectionIdSet.add(fallback.id);
  }

  const selectedConnectionId = String(input?.selectedConnectionId || "").trim();
  const safeSelectedConnectionId = connectionIdSet.has(selectedConnectionId)
    ? selectedConnectionId
    : normalizedConnections[0]?.id || "";

  const routePreferences: Record<string, ExtensionConnectionRoutePreference | undefined> = {};
  const rawPreferences =
    input?.routePreferences && typeof input.routePreferences === "object"
      ? input.routePreferences
      : {};

  for (const connection of normalizedConnections) {
    routePreferences[connection.id] = normalizeRoutePreference(
      (rawPreferences as Record<string, Partial<ExtensionConnectionRoutePreference> | undefined>)[
        connection.id
      ],
    );
  }

  return {
    connections: normalizedConnections,
    selectedConnectionId: safeSelectedConnectionId,
    routePreferences,
    taskPrompt:
      typeof input?.taskPrompt === "string" && input.taskPrompt.trim()
        ? input.taskPrompt
        : DEFAULT_TASK_PROMPT,
  };
}

type LegacyExtensionSettings = {
  consoleHost?: unknown;
  consolePort?: unknown;
  consoleBaseUrl?: unknown;
  agentId?: unknown;
  chatKey?: unknown;
  taskPrompt?: unknown;
};

async function readSyncStorage(key: string): Promise<Record<string, unknown>> {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result as Record<string, unknown>);
    });
  });
}

async function writeSyncStorage(key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function readLocalStorage(key: string): Promise<Record<string, unknown>> {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result as Record<string, unknown>);
    });
  });
}

async function writeLocalStorage(key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function removeLocalStorageKey(key: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove([key], () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function loadLegacySettings(): Promise<LegacyExtensionSettings | null> {
  const stored = await readSyncStorage(LEGACY_SETTINGS_STORAGE_KEY);
  const raw = stored[LEGACY_SETTINGS_STORAGE_KEY];
  if (!raw || typeof raw !== "object") return null;
  return raw as LegacyExtensionSettings;
}

async function loadLegacyAuthToken(): Promise<string> {
  const [localStored, syncStored] = await Promise.all([
    readLocalStorage(LEGACY_AUTH_STORAGE_KEY),
    readSyncStorage(LEGACY_SETTINGS_STORAGE_KEY),
  ]);

  const localRaw = localStored[LEGACY_AUTH_STORAGE_KEY];
  if (localRaw && typeof localRaw === "object") {
    return normalizeAuthToken(
      (localRaw as Record<string, unknown>).token,
    ).slice(0, 4096);
  }

  const syncRaw = syncStored[LEGACY_SETTINGS_STORAGE_KEY];
  if (syncRaw && typeof syncRaw === "object") {
    return normalizeAuthToken(
      (syncRaw as Record<string, unknown>).authToken,
    ).slice(0, 4096);
  }

  return "";
}

async function migrateLegacySettingsIfNeeded(): Promise<ExtensionSettings | null> {
  const legacy = await loadLegacySettings();
  if (!legacy) return null;

  const legacyBaseUrl = parseLegacyBaseUrl(legacy.consoleBaseUrl);
  const connection = buildDefaultConnection({
    protocol: legacyBaseUrl?.protocol,
    host: legacyBaseUrl?.host || legacy.consoleHost,
    port: legacyBaseUrl?.port || legacy.consolePort,
    basePath: legacyBaseUrl?.basePath,
  });

  const migrated = normalizeSettings({
    connections: [connection],
    selectedConnectionId: connection.id,
    routePreferences: {
      [connection.id]: {
        agentId: String(legacy.agentId || "").trim(),
        sessionId: String(legacy.chatKey || "").trim(),
      },
    },
    taskPrompt:
      typeof legacy.taskPrompt === "string" && legacy.taskPrompt.trim()
        ? legacy.taskPrompt
        : DEFAULT_TASK_PROMPT,
  });

  await writeSyncStorage(SETTINGS_STORAGE_KEY, migrated);

  const legacyToken = await loadLegacyAuthToken();
  if (legacyToken) {
    await saveConnectionSecrets({
      [connection.id]: {
        token: legacyToken,
      },
    });
  }

  return migrated;
}

/**
 * 加载设置。
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await readSyncStorage(SETTINGS_STORAGE_KEY);
  const raw = stored[SETTINGS_STORAGE_KEY];
  if (raw && typeof raw === "object") {
    return normalizeSettings(raw as Partial<ExtensionSettings>);
  }

  const migrated = await migrateLegacySettingsIfNeeded();
  if (migrated) {
    return normalizeSettings(migrated);
  }

  return normalizeSettings(DEFAULT_SETTINGS);
}

/**
 * 保存设置。
 */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  await writeSyncStorage(SETTINGS_STORAGE_KEY, normalized);
}

function normalizeConnectionSecrets(
  input: unknown,
): ExtensionServerConnectionSecretMap {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const out: ExtensionServerConnectionSecretMap = {};
  for (const [connectionId, value] of Object.entries(source)) {
    const normalizedId = normalizeConnectionId(connectionId);
    if (!normalizedId) continue;
    const token = normalizeAuthToken(
      value && typeof value === "object"
        ? (value as Record<string, unknown>).token
        : "",
    ).slice(0, 4096);
    out[normalizedId] = { token };
  }
  return out;
}

/**
 * 加载所有连接密钥。
 */
export async function loadConnectionSecrets(): Promise<ExtensionServerConnectionSecretMap> {
  const stored = await readLocalStorage(SECRETS_STORAGE_KEY);
  return normalizeConnectionSecrets(stored[SECRETS_STORAGE_KEY]);
}

/**
 * 保存所有连接密钥。
 */
export async function saveConnectionSecrets(
  secrets: ExtensionServerConnectionSecretMap,
): Promise<void> {
  await writeLocalStorage(SECRETS_STORAGE_KEY, normalizeConnectionSecrets(secrets));
}

/**
 * 读取单个连接的 Bearer Token。
 */
export async function loadConnectionToken(connectionId: string): Promise<string> {
  const normalizedId = normalizeConnectionId(connectionId);
  if (!normalizedId) return "";
  const secrets = await loadConnectionSecrets();
  return String(secrets[normalizedId]?.token || "").trim();
}

/**
 * 保存单个连接的 Bearer Token。
 */
export async function saveConnectionToken(
  connectionId: string,
  token: string,
): Promise<void> {
  const normalizedId = normalizeConnectionId(connectionId);
  if (!normalizedId) return;
  const secrets = await loadConnectionSecrets();
  secrets[normalizedId] = {
    token: normalizeAuthToken(token).slice(0, 4096),
  };
  await saveConnectionSecrets(secrets);
}

/**
 * 删除单个连接的 Bearer Token。
 */
export async function clearConnectionToken(connectionId: string): Promise<void> {
  const normalizedId = normalizeConnectionId(connectionId);
  if (!normalizedId) return;
  const secrets = await loadConnectionSecrets();
  delete secrets[normalizedId];
  await saveConnectionSecrets(secrets);
}

/**
 * 清理旧版全局鉴权状态。
 */
export async function clearLegacyAuthState(): Promise<void> {
  await removeLocalStorageKey(LEGACY_AUTH_STORAGE_KEY);
}

function normalizePageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeSendRecord(
  input: Partial<ExtensionPageSendRecord> | null | undefined,
): ExtensionPageSendRecord | null {
  if (!input || typeof input !== "object") return null;
  const id = String(input.id || "").trim();
  const connectionId = normalizeConnectionId(input.connectionId);
  const pageUrl = normalizePageUrl(String(input.pageUrl || ""));
  const pageTitle = String(input.pageTitle || "").trim();
  const agentId = String(input.agentId || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  const taskPrompt = String(input.taskPrompt || "").trim();
  const attachmentFileName = String(input.attachmentFileName || "").trim();
  const sentAt =
    typeof input.sentAt === "number" && Number.isFinite(input.sentAt)
      ? Math.trunc(input.sentAt)
      : 0;
  if (
    !id ||
    !connectionId ||
    !pageUrl ||
    !agentId ||
    !sessionId ||
    !attachmentFileName ||
    sentAt <= 0
  ) {
    return null;
  }
  return {
    id,
    connectionId,
    pageUrl,
    pageTitle,
    agentId,
    sessionId,
    taskPrompt,
    attachmentFileName,
    sentAt,
  };
}

type LegacySendRecord = {
  id?: unknown;
  pageUrl?: unknown;
  pageTitle?: unknown;
  agentId?: unknown;
  chatKey?: unknown;
  taskPrompt?: unknown;
  attachmentFileName?: unknown;
  sentAt?: unknown;
};

async function loadAllSendRecords(): Promise<ExtensionPageSendRecord[]> {
  const [currentStored, legacyStored, settings] = await Promise.all([
    readLocalStorage(SEND_HISTORY_STORAGE_KEY),
    readLocalStorage(LEGACY_SEND_HISTORY_STORAGE_KEY),
    loadSettings(),
  ]);

  const currentRaw = currentStored[SEND_HISTORY_STORAGE_KEY];
  const out: ExtensionPageSendRecord[] = [];
  const dedup = new Set<string>();

  if (Array.isArray(currentRaw)) {
    for (const item of currentRaw) {
      const normalized = normalizeSendRecord(
        item as Partial<ExtensionPageSendRecord>,
      );
      if (!normalized) continue;
      const dedupKey = `${normalized.id}:${normalized.sentAt}`;
      if (dedup.has(dedupKey)) continue;
      dedup.add(dedupKey);
      out.push(normalized);
    }
  }

  const legacyRaw = legacyStored[LEGACY_SEND_HISTORY_STORAGE_KEY];
  if (Array.isArray(legacyRaw)) {
    const fallbackConnectionId =
      settings.selectedConnectionId || settings.connections[0]?.id || "";
    for (const item of legacyRaw) {
      const value = item as LegacySendRecord;
      const normalized = normalizeSendRecord({
        id: String(value.id || "").trim(),
        connectionId: fallbackConnectionId,
        pageUrl: String(value.pageUrl || "").trim(),
        pageTitle: String(value.pageTitle || "").trim(),
        agentId: String(value.agentId || "").trim(),
        sessionId: String(value.chatKey || "").trim(),
        taskPrompt: String(value.taskPrompt || "").trim(),
        attachmentFileName: String(value.attachmentFileName || "").trim(),
        sentAt:
          typeof value.sentAt === "number"
            ? value.sentAt
            : Number.parseInt(String(value.sentAt || ""), 10),
      });
      if (!normalized) continue;
      const dedupKey = `${normalized.id}:${normalized.sentAt}`;
      if (dedup.has(dedupKey)) continue;
      dedup.add(dedupKey);
      out.push(normalized);
    }
  }

  out.sort((a, b) => b.sentAt - a.sentAt);
  return out;
}

async function saveAllSendRecords(records: ExtensionPageSendRecord[]): Promise<void> {
  await writeLocalStorage(SEND_HISTORY_STORAGE_KEY, records);
}

/**
 * 记录一次页面发送事件。
 */
export async function appendPageSendRecord(params: {
  connectionId: string;
  pageUrl: string;
  pageTitle: string;
  agentId: string;
  sessionId: string;
  taskPrompt: string;
  attachmentFileName: string;
}): Promise<void> {
  const nextRecord: ExtensionPageSendRecord = {
    id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    connectionId: normalizeConnectionId(params.connectionId),
    pageUrl: normalizePageUrl(params.pageUrl),
    pageTitle: String(params.pageTitle || "").trim(),
    agentId: String(params.agentId || "").trim(),
    sessionId: String(params.sessionId || "").trim(),
    taskPrompt: String(params.taskPrompt || "").trim(),
    attachmentFileName: String(params.attachmentFileName || "").trim(),
    sentAt: Date.now(),
  };
  const all = await loadAllSendRecords();
  const merged = [nextRecord, ...all].slice(0, SEND_HISTORY_MAX_COUNT);
  await saveAllSendRecords(merged);
}

/**
 * 读取当前页面发送记录。
 */
export async function loadPageSendRecords(params: {
  connectionId?: string;
  pageUrl: string;
  limit?: number;
}): Promise<ExtensionPageSendRecord[]> {
  const connectionId = normalizeConnectionId(params.connectionId);
  const pageUrl = normalizePageUrl(params.pageUrl);
  if (!pageUrl) return [];
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.min(50, Math.trunc(params.limit)))
      : 8;
  const all = await loadAllSendRecords();
  return all
    .filter((item) => item.pageUrl === pageUrl)
    .filter((item) => (connectionId ? item.connectionId === connectionId : true))
    .slice(0, limit);
}
