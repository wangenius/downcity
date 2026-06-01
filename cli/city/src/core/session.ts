/**
 * Session 与 server 配置持久化模块。
 *
 * 关键说明（中文）
 * - server 是一等资源，必须显式配置后 CLI 才进入身份菜单
 * - 不再注入默认 server；没有 server 时必须先添加
 * - user session 仍然按 base_url 隔离保存
 * - admin_secret_key 直接属于 server 配置，不再作为独立 session 维护
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { normalizeBaseUrl } from "./env.js";

const DIR = path.join(os.homedir(), ".downcity");
const CONFIG_FILE = path.join(DIR, "config.json");

// ============================================================
// 类型
// ============================================================

export interface AdminSession {
  /** 当前 server 的 server URL */
  base_url: string;
  /** 当前 server 的 admin secret key */
  admin_secret_key: string;
}

export interface UserSession {
  /** 当前登录目标的 server server URL */
  base_url: string;
  /** 用户邮箱 */
  email: string;
  /** 用户 ID */
  user_id: string;
  /** 当前 town ID */
  town_id: string;
  /** user token */
  user_token: string;
}

export interface ServerProfile {
  /** 展示名称 */
  name: string;
  /** City 服务地址 */
  base_url: string;
  /** 该 server 对应的 admin secret key */
  admin_secret_key: string;
}

export interface ClientConfig {
  /** 当前激活的 server URL */
  active_server_url?: string;
  /** 已保存的 server 列表 */
  servers: ServerProfile[];
  /** 当前 Cloudflare account id，属于 CLI 本地 provider 状态。 */
  cloudflare_account_id?: string;
  /** 当前选择的模型 ID */
  model: string;
  /** 上次使用的身份 */
  last_identity?: "admin" | "user";
}

// ============================================================
// Config 读写
// ============================================================

/**
 * 从磁盘读取 config。
 */
export function readConfig(): ClientConfig {
  const raw = readJSON<Record<string, unknown>>(CONFIG_FILE) ?? {};
  const servers = readServersFromConfig(raw);
  const active_server_url = readActiveServerURL(raw, servers);

  return {
    active_server_url,
    servers,
    cloudflare_account_id: typeof raw.cloudflare_account_id === "string"
      ? raw.cloudflare_account_id.trim() || undefined
      : undefined,
    model: typeof raw.model === "string" ? raw.model : "",
    last_identity: raw.last_identity === "admin" || raw.last_identity === "user"
      ? raw.last_identity
      : undefined,
  };
}

/**
 * 写入 config 到磁盘。
 */
export function writeConfig(config: ClientConfig): void {
  const normalizedServers = normalizeServers(config.servers);
  const active = normalizedServers.find((server) => server.base_url === config.active_server_url)
    ? config.active_server_url
    : normalizedServers[0]?.base_url;

  writeJSON(CONFIG_FILE, {
    active_server_url: active,
    servers: normalizedServers,
    cloudflare_account_id: typeof config.cloudflare_account_id === "string"
      ? config.cloudflare_account_id.trim() || undefined
      : undefined,
    model: config.model ?? "",
    last_identity: config.last_identity,
  });
}

/**
 * 读取当前保存的 Cloudflare account id。
 */
export function readCloudflareAccountId(): string | undefined {
  return readConfig().cloudflare_account_id;
}

/**
 * 写入当前 Cloudflare account id。
 */
export function writeCloudflareAccountId(account_id: string): void {
  const config = readConfig();
  writeConfig({
    ...config,
    cloudflare_account_id: String(account_id).trim() || undefined,
  });
}

// ============================================================
// Server 管理
// ============================================================

/**
 * 读取当前激活的 server。
 */
export function readActiveServer(): ServerProfile | undefined {
  const config = readConfig();
  return config.servers.find((server) => server.base_url === config.active_server_url);
}

/**
 * 设置当前激活的 server。
 */
export function setActiveServer(baseUrl: string): void {
  const config = readConfig();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!config.servers.find((server) => server.base_url === normalizedBaseUrl)) {
    throw new Error(`Unknown server: ${normalizedBaseUrl}`);
  }
  writeConfig({
    ...config,
    active_server_url: normalizedBaseUrl,
  });
}

/**
 * 添加 server，并设为当前激活 server。
 */
export function addServer(input: {
  base_url: string;
  admin_secret_key?: string;
  name?: string;
}): ServerProfile {
  const config = readConfig();
  const normalized = normalizeServer(input);
  const existingIndex = config.servers.findIndex((server) => server.base_url === normalized.base_url);

  if (existingIndex >= 0) {
    config.servers[existingIndex] = normalized;
  } else {
    config.servers.push(normalized);
  }

  writeConfig({
    ...config,
    servers: config.servers,
    active_server_url: normalized.base_url,
  });

  return normalized;
}

/**
 * 更新已存在的 server。
 *
 * 关键说明（中文）
 * - 如果 base_url 变化，会清除旧 URL 下的 user session
 * - active server 会自动切换到新 URL
 */
export function updateServer(
  currentBaseUrl: string,
  input: {
    base_url: string;
    admin_secret_key?: string;
    name?: string;
  },
): ServerProfile {
  const config = readConfig();
  const normalizedCurrent = normalizeBaseUrl(currentBaseUrl);
  const index = config.servers.findIndex((server) => server.base_url === normalizedCurrent);
  if (index < 0) {
    throw new Error(`Unknown server: ${normalizedCurrent}`);
  }

  const normalizedNext = normalizeServer(input);
  const duplicateIndex = config.servers.findIndex((server) => server.base_url === normalizedNext.base_url);
  if (duplicateIndex >= 0 && duplicateIndex !== index) {
    throw new Error(`Server already exists: ${normalizedNext.base_url}`);
  }

  config.servers[index] = normalizedNext;
  const activeServerUrl = config.active_server_url === normalizedCurrent
    ? normalizedNext.base_url
    : config.active_server_url;

  writeConfig({
    ...config,
    servers: config.servers,
    active_server_url: activeServerUrl,
  });

  if (normalizedCurrent !== normalizedNext.base_url) {
    clearServerSessions(normalizedCurrent);
  }

  return normalizedNext;
}

/**
 * 删除 server，同时清除该 URL 下的所有 session。
 */
export function removeServer(baseUrl: string): void {
  const config = readConfig();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const nextServers = config.servers.filter((server) => server.base_url !== normalizedBaseUrl);
  const nextActive = config.active_server_url === normalizedBaseUrl
    ? nextServers[0]?.base_url
    : config.active_server_url;

  writeConfig({
    ...config,
    servers: nextServers,
    active_server_url: nextActive,
  });
  clearServerSessions(normalizedBaseUrl);
}

/**
 * 根据 URL 读取 server。
 */
export function readServer(baseUrl: string): ServerProfile | undefined {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return readConfig().servers.find((server) => server.base_url === normalizedBaseUrl);
}

// ============================================================
// User Session（按 URL 隔离）
// ============================================================

function sessionDir(url: string): string {
  return path.join(DIR, "servers", urlHash(url));
}

function userFile(url: string): string {
  return path.join(sessionDir(url), "user.json");
}

export function readUserSession(url: string): UserSession | undefined {
  return readJSON<UserSession>(userFile(url));
}

export function writeUserSession(session: UserSession): void {
  writeJSON(userFile(session.base_url), session);
}

export function clearUserSession(url: string): void {
  try {
    fs.unlinkSync(userFile(url));
  } catch {
    // ignore
  }
}

/**
 * 清除某个 server URL 下的所有 session。
 */
export function clearServerSessions(url: string): void {
  clearUserSession(url);
}

// ============================================================
// 内部工具
// ============================================================

function readServersFromConfig(raw: Record<string, unknown>): ServerProfile[] {
  const input = Array.isArray(raw.servers) ? raw.servers : [];
  const servers: ServerProfile[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawBaseUrl = typeof record.base_url === "string"
      ? record.base_url
      : typeof record.url === "string"
        ? record.url
        : "";

    if (!rawBaseUrl.trim()) continue;

    const normalizedBaseUrl = normalizeBaseUrl(rawBaseUrl);
    const adminSecretKey = typeof record.admin_secret_key === "string"
      ? record.admin_secret_key.trim()
      : "";
    const name = typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : deriveServerName(normalizedBaseUrl);

    const existing = servers.find((server) => server.base_url === normalizedBaseUrl);
    if (existing) {
      existing.name = name;
      existing.admin_secret_key = adminSecretKey;
      continue;
    }

    servers.push({
      name,
      base_url: normalizedBaseUrl,
      admin_secret_key: adminSecretKey,
    });
  }

  if (servers.length === 0 && typeof raw.base_url === "string" && raw.base_url.trim()) {
    const normalizedBaseUrl = normalizeBaseUrl(raw.base_url);
    servers.push({
      name: deriveServerName(normalizedBaseUrl),
      base_url: normalizedBaseUrl,
      admin_secret_key: "",
    });
  }

  return servers;
}

function readActiveServerURL(raw: Record<string, unknown>, servers: ServerProfile[]): string | undefined {
  const rawActive = typeof raw.active_server_url === "string"
    ? raw.active_server_url
    : typeof raw.base_url === "string"
      ? raw.base_url
      : "";

  if (rawActive.trim()) {
    const normalized = normalizeBaseUrl(rawActive);
    if (servers.find((server) => server.base_url === normalized)) {
      return normalized;
    }
  }

  return servers[0]?.base_url;
}

function normalizeServers(servers: ServerProfile[]): ServerProfile[] {
  const normalized: ServerProfile[] = [];

  for (const server of servers) {
    const item = normalizeServer(server);
    if (normalized.find((candidate) => candidate.base_url === item.base_url)) {
      continue;
    }
    normalized.push(item);
  }

  return normalized;
}

function normalizeServer(input: {
  base_url: string;
  admin_secret_key?: string;
  name?: string;
}): ServerProfile {
  const normalizedBaseUrl = normalizeBaseUrl(input.base_url);
  const normalizedAdminSecretKey = String(input.admin_secret_key ?? "").trim();
  const normalizedName = String(input.name ?? "").trim() || deriveServerName(normalizedBaseUrl);

  return {
    name: normalizedName,
    base_url: normalizedBaseUrl,
    admin_secret_key: normalizedAdminSecretKey,
  };
}

function deriveServerName(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.hostname || baseUrl;
  } catch {
    return baseUrl;
  }
}

function urlHash(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function readJSON<T>(filepath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJSON(filepath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}
