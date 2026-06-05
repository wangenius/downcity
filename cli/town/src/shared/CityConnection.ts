/**
 * Town City user 连接管理服务。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `town` CLI 自己维护 user 登录态，避免把 user token 复制到 city 状态。
 * - Town 可以只读发现 `city` CLI 已配置的 base 地址，但不依赖 city 内部模块。
 * - CLI 命令装配统一放在 `src/command/CityCommand.ts`，本模块只保留状态与登录流程。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prompts from "prompts";
import { PlatformStore } from "../town/store/index.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { performTownCityUserLogin } from "./CityUserLogin.js";
import type {
  TownCityConnectionState,
  TownCityServerProfile,
} from "../types/TownCityConnection.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import type {
  CityAdminConfig,
  TownCityLocalProfile,
  TownCityLocalState,
} from "../types/TownCityState.js";

export const DEFAULT_CITY_URL = "https://base.downcity.ai";
export const DEFAULT_TOWN_ID = "town_downcity";
const CITY_CONFIG_PATH = path.join(os.homedir(), ".downcity", "config.json");
const TOWN_CITY_STATE_KEY = "town.city.state";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function defaultProtocol(value: string): "http" | "https" {
  const host = value.split("/")[0] ?? "";
  const clean_host = host.split(":")[0] ?? "";
  if (
    clean_host === "localhost" ||
    clean_host.includes(":") ||
    clean_host.split(".").length === 4
  ) {
    return "http";
  }
  return "https";
}

export function normalizeCityUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const has_protocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(raw);
  const with_protocol = has_protocol ? raw : `${defaultProtocol(raw)}://${raw}`;
  const url = new URL(with_protocol);
  if (
    !url.port &&
    (url.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/u.test(url.hostname))
  ) {
    url.port = "43127";
  }
  return url.toString().replace(/\/+$/, "");
}

function deriveServerName(city_url: string): string {
  try {
    return new URL(city_url).hostname || city_url;
  } catch {
    return city_url;
  }
}

function readJsonFile<T>(file_path: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file_path, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeLocalState(value: TownCityLocalState | null | undefined): TownCityLocalState {
  const selected_base_url = normalizeCityUrl(readString(value?.selected_base_url));
  const profiles: TownCityLocalProfile[] = [];
  for (const item of Array.isArray(value?.profiles) ? value.profiles : []) {
    const base_url = normalizeCityUrl(readString(item.base_url));
    if (!base_url || profiles.some((profile) => profile.base_url === base_url)) continue;
    profiles.push({
      name: readString(item.name) || deriveServerName(base_url),
      base_url,
    });
  }
  const sessions: Record<string, TownCityUserSession> = {};
  const input_sessions = value?.sessions && typeof value.sessions === "object"
    ? value.sessions
    : {};
  for (const [key, session] of Object.entries(input_sessions)) {
    const base_url = normalizeCityUrl(readString(session?.base_url) || key);
    const user_token = readString(session?.user_token);
    if (!base_url || !user_token) continue;
    sessions[base_url] = {
      base_url,
      town_id: readString(session?.town_id) || DEFAULT_TOWN_ID,
      user_id: readString(session?.user_id) || undefined,
      user_label: readString(session?.user_label) || undefined,
      user_token,
      updated_at: readString(session?.updated_at) || new Date().toISOString(),
    };
  }
  return {
    selected_base_url: selected_base_url || undefined,
    profiles,
    sessions,
  };
}

function readTownCityState(): TownCityLocalState {
  const store = new PlatformStore();
  try {
    return normalizeLocalState(
      store.getSecureSettingJsonSync<TownCityLocalState>(TOWN_CITY_STATE_KEY),
    );
  } finally {
    store.close();
  }
}

function writeTownCityState(state: TownCityLocalState): void {
  const store = new PlatformStore();
  try {
    store.setSecureSettingJsonSync(TOWN_CITY_STATE_KEY, normalizeLocalState(state));
  } finally {
    store.close();
  }
}

function readCityAdminConfig(): CityAdminConfig {
  return readJsonFile<CityAdminConfig>(CITY_CONFIG_PATH) ?? {};
}

function readCityAdminServers(): TownCityServerProfile[] {
  const raw = readCityAdminConfig();
  const servers = Array.isArray(raw.servers) ? raw.servers : [];
  const active_url = normalizeCityUrl(readString(raw.active_server_url));
  const out: TownCityServerProfile[] = [];
  const state = readTownCityState();
  const selected_base_url = resolveSelectedBaseUrl(state);

  for (const item of servers) {
    const base_url = normalizeCityUrl(readString(item.base_url) || readString(item.url));
    if (!base_url || out.some((server) => server.base_url === base_url)) continue;
    const session = state.sessions?.[base_url];
    out.push({
      name: readString(item.name) || deriveServerName(base_url),
      base_url,
      selected: base_url === selected_base_url,
      source: "city-admin",
      has_admin_secret_key: Boolean(readString(item.admin_secret_key)),
      has_user_session: Boolean(session?.user_token),
      town_id: session?.town_id,
      user_id: session?.user_id,
    });
  }

  return out.sort((left, right) =>
    Number(right.base_url === active_url) - Number(left.base_url === active_url)
    || left.name.localeCompare(right.name)
    || left.base_url.localeCompare(right.base_url),
  );
}

function readCityAdminSecretForUrl(city_url: string): string | undefined {
  const target_url = normalizeCityUrl(city_url);
  const raw = readCityAdminConfig();
  const servers = Array.isArray(raw.servers) ? raw.servers : [];
  const matched = servers.find((item) =>
    normalizeCityUrl(readString(item.base_url) || readString(item.url)) === target_url,
  );
  return readString(matched?.admin_secret_key) || undefined;
}

export function readTownCityAdminSecretForBase(city_url: string): string | undefined {
  return readCityAdminSecretForUrl(city_url);
}

function resolveSelectedBaseUrl(state: TownCityLocalState = readTownCityState()): string {
  return normalizeCityUrl(readString(state.selected_base_url)) || DEFAULT_CITY_URL;
}

function upsertTownProfile(state: TownCityLocalState, input: {
  base_url: string;
  name?: string;
}): TownCityLocalState {
  const base_url = normalizeCityUrl(input.base_url);
  if (!base_url) return state;
  const profiles = [...(state.profiles ?? [])];
  const index = profiles.findIndex((item) => item.base_url === base_url);
  const profile = {
    name: readString(input.name) || deriveServerName(base_url),
    base_url,
  };
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  return {
    ...state,
    selected_base_url: base_url,
    profiles,
  };
}

function listTownCityServers(): TownCityServerProfile[] {
  const state = readTownCityState();
  const selected_base_url = resolveSelectedBaseUrl(state);
  const admin_servers = readCityAdminServers();
  const by_url = new Map<string, TownCityServerProfile>();

  const append = (profile: TownCityServerProfile): void => {
    const existing = by_url.get(profile.base_url);
    if (!existing) {
      by_url.set(profile.base_url, profile);
      return;
    }
    by_url.set(profile.base_url, {
      ...existing,
      selected: existing.selected || profile.selected,
      source: existing.source === "town" ? "town" : profile.source,
      has_admin_secret_key: existing.has_admin_secret_key || profile.has_admin_secret_key,
      has_user_session: existing.has_user_session || profile.has_user_session,
      town_id: existing.town_id || profile.town_id,
      user_id: existing.user_id || profile.user_id,
    });
  };

  for (const profile of state.profiles ?? []) {
    const session = state.sessions?.[profile.base_url];
    append({
      name: profile.name,
      base_url: profile.base_url,
      selected: profile.base_url === selected_base_url,
      source: "town",
      has_admin_secret_key: Boolean(readCityAdminSecretForUrl(profile.base_url)),
      has_user_session: Boolean(session?.user_token),
      town_id: session?.town_id,
      user_id: session?.user_id,
    });
  }

  for (const server of admin_servers) append(server);

  const default_session = state.sessions?.[DEFAULT_CITY_URL];
  append({
    name: "Downcity Base",
    base_url: DEFAULT_CITY_URL,
    selected: DEFAULT_CITY_URL === selected_base_url,
    source: "default",
    has_admin_secret_key: Boolean(readCityAdminSecretForUrl(DEFAULT_CITY_URL)),
    has_user_session: Boolean(default_session?.user_token),
    town_id: default_session?.town_id,
    user_id: default_session?.user_id,
  });

  return [...by_url.values()].sort((left, right) =>
    Number(right.selected) - Number(left.selected)
    || Number(right.source === "default") - Number(left.source === "default")
    || left.name.localeCompare(right.name)
    || left.base_url.localeCompare(right.base_url),
  );
}

function findCityServer(input?: string): TownCityServerProfile | null {
  const query = String(input || "").trim();
  const servers = listTownCityServers();
  if (!query) return servers.find((server) => server.selected) ?? servers[0] ?? null;
  const normalized_query_url = normalizeCityUrl(query);
  return servers.find((server) =>
    server.name === query ||
    server.base_url === normalized_query_url ||
    server.base_url === query,
  ) ?? null;
}

function readCurrentTownCitySession(): TownCityUserSession | null {
  const state = readTownCityState();
  const base_url = resolveSelectedBaseUrl(state);
  return state.sessions?.[base_url] ?? null;
}

export function readTownCityUserSessionForRuntime(): {
  city_url: string;
  town_id: string;
  user_token: string;
} | null {
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const session = state.sessions?.[city_url] ?? null;
  if (!session?.user_token) return null;
  return {
    city_url,
    town_id: session.town_id || DEFAULT_TOWN_ID,
    user_token: session.user_token,
  };
}

export function readTownCityConnectionState(): TownCityConnectionState {
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const session = state.sessions?.[city_url] ?? null;
  if (session?.user_token) {
    return {
      city_url,
      town_id: session.town_id || DEFAULT_TOWN_ID,
      has_user_token: true,
      source: "town-session",
      user_id: session.user_id,
      user_label: session.user_label,
    };
  }

  const server = listTownCityServers().find((item) => item.base_url === city_url);
  return {
    city_url,
    town_id: DEFAULT_TOWN_ID,
    has_user_token: false,
    source: server?.source === "city-admin"
      ? "city-admin"
      : server?.source === "town"
        ? "town-base"
        : "default",
  };
}

export function emitCityConnectionStatus(options?: { as_json?: boolean }): void {
  const state = readTownCityConnectionState();
  if (options?.as_json === true) {
    printResult({
      asJson: true,
      success: state.source !== "missing",
      title: "city connection",
      payload: {
        connection: state,
        servers: listTownCityServers(),
      },
    });
    return;
  }

  emitCliBlock({
    tone: state.has_user_token ? "success" : "warning",
    title: "City connection",
    summary: state.has_user_token ? "signed in" : "base selected",
    facts: [
      { label: "url", value: state.city_url },
      { label: "town", value: state.town_id },
      { label: "user token", value: state.has_user_token ? "configured" : "missing" },
      { label: "source", value: state.source },
      ...(state.user_id ? [{ label: "user", value: state.user_id }] : []),
    ],
    note: state.has_user_token
      ? undefined
      : "Run `town city login` to sign in as a City user.",
  });
}

export function emitCityServerList(options?: { as_json?: boolean }): void {
  const servers = listTownCityServers();
  if (options?.as_json === true) {
    printResult({
      asJson: true,
      success: true,
      title: "city bases",
      payload: {
        count: servers.length,
        servers,
      },
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "City bases",
    summary: `${servers.length} available`,
    items: servers.map((server) => ({
      tone: server.selected ? "success" : "info",
      title: server.name,
      facts: [
        { label: "url", value: server.base_url },
        { label: "selected", value: server.selected ? "yes" : "no" },
        { label: "source", value: server.source },
        { label: "user session", value: server.has_user_session ? "yes" : "no" },
        { label: "admin profile", value: server.has_admin_secret_key ? "yes" : "no" },
      ],
    })),
  });
}

export async function runCityConnectCommand(params: {
  url?: string;
  as_json?: boolean;
}): Promise<void> {
  let city_url = normalizeCityUrl(String(params.url || ""));

  if (!city_url && process.stdin.isTTY && process.stdout.isTTY) {
    const response = (await prompts({
      type: "text",
      name: "city_url",
      message: "City base URL",
      initial: DEFAULT_CITY_URL,
    })) as { city_url?: string };
    city_url = normalizeCityUrl(String(response.city_url || ""));
  }

  if (!city_url) city_url = DEFAULT_CITY_URL;

  const state = upsertTownProfile(readTownCityState(), { base_url: city_url });
  writeTownCityState(state);

  printResult({
    asJson: params.as_json === true,
    success: true,
    title: "city base connected",
    payload: {
      city_url,
      fix: "Run `town city login` to sign in as a user.",
    },
  });
}

export async function runCityUseCommand(params: {
  server?: string;
  as_json?: boolean;
}): Promise<void> {
  const server = findCityServer(params.server);
  if (!server) {
    printResult({
      asJson: params.as_json === true,
      success: false,
      title: "city use failed",
      payload: {
        error: "No City base matched the input",
        fix: "Run `town city list` to inspect available bases.",
      },
    });
    return;
  }

  const state = upsertTownProfile(readTownCityState(), {
    base_url: server.base_url,
    name: server.name,
  });
  writeTownCityState(state);

  printResult({
    asJson: params.as_json === true,
    success: true,
    title: "city base selected",
    payload: {
      city_url: server.base_url,
      source: server.source,
      has_user_session: server.has_user_session,
      fix: server.has_user_session ? undefined : "Run `town city login` to sign in as a user.",
    },
  });
}

function saveUserSession(session: TownCityUserSession): void {
  const state = upsertTownProfile(readTownCityState(), {
    base_url: session.base_url,
  });
  const sessions = {
    ...(state.sessions ?? {}),
    [session.base_url]: session,
  };
  writeTownCityState({
    ...state,
    selected_base_url: session.base_url,
    sessions,
  });
}

export async function runCityLoginCommand(params: {
  url?: string;
  town_id?: string;
  as_json?: boolean;
}): Promise<void> {
  if (params.url) {
    const city_url = normalizeCityUrl(params.url);
    if (city_url) {
      writeTownCityState(upsertTownProfile(readTownCityState(), { base_url: city_url }));
    }
  }
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const town_id = readString(params.town_id) || readCurrentTownCitySession()?.town_id || DEFAULT_TOWN_ID;
  const session = await performTownCityUserLogin({
    city_url,
    town_id,
  });
  if (!session) {
    printResult({
      asJson: params.as_json === true,
      success: false,
      title: "city login cancelled",
      payload: { city_url },
    });
    return;
  }

  saveUserSession(session);
  printResult({
    asJson: params.as_json === true,
    success: true,
    title: "city user signed in",
    payload: {
      city_url: session.base_url,
      town_id: session.town_id,
      user_id: session.user_id,
      user_label: session.user_label,
    },
  });
}

export function runCityLogoutCommand(options?: { as_json?: boolean }): void {
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const sessions = { ...(state.sessions ?? {}) };
  delete sessions[city_url];
  writeTownCityState({
    ...state,
    sessions,
  });
  printResult({
    asJson: options?.as_json === true,
    success: true,
    title: "city user signed out",
    payload: {
      city_url,
    },
  });
}

export function runCityDisconnectCommand(options?: { as_json?: boolean }): void {
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const profiles = (state.profiles ?? []).filter((profile) => profile.base_url !== city_url);
  const sessions = { ...(state.sessions ?? {}) };
  delete sessions[city_url];
  writeTownCityState({
    ...state,
    selected_base_url: DEFAULT_CITY_URL,
    profiles,
    sessions,
  });
  printResult({
    asJson: options?.as_json === true,
    success: true,
    title: "city base disconnected",
    payload: {
      removed: city_url,
      selected: DEFAULT_CITY_URL,
    },
  });
}

async function promptCityManagerAction(): Promise<string | null> {
  const state = readTownCityConnectionState();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: "管理 City user 连接",
    choices: [
      {
        title: "查看连接状态",
        description: state.city_url,
        value: "status",
      },
      {
        title: "选择 City base",
        description: "从 Town / city admin / 默认 base 候选中选择",
        value: "use",
      },
      {
        title: "添加 City base",
        description: "手动写入一个 Town user base",
        value: "connect",
      },
      {
        title: "User 登录",
        description: state.has_user_token ? "重新登录当前 base" : "登录当前 base",
        value: "login",
      },
      {
        title: "User 登出",
        description: "清除当前 base 的 Town user session",
        value: "logout",
      },
      {
        title: "查看可用 base",
        description: "包含默认 base 与 city admin 已保存 base",
        value: "list",
      },
      {
        title: "退出",
        description: "关闭 City user 连接管理",
        value: "exit",
      },
    ],
    initial: state.has_user_token ? 0 : 3,
  })) as { action?: string };

  return String(response.action || "").trim() || null;
}

export async function runInteractiveCityManager(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  while (true) {
    const action = await promptCityManagerAction();
    if (!action || action === "exit") {
      emitCliBlock({
        tone: "info",
        title: "City manager closed",
      });
      return;
    }

    if (action === "status") {
      emitCityConnectionStatus();
      continue;
    }
    if (action === "list") {
      emitCityServerList();
      continue;
    }
    if (action === "connect") {
      await runCityConnectCommand({});
      continue;
    }
    if (action === "use") {
      const server = await promptSelectCityBase();
      if (server) await runCityUseCommand({ server: server.base_url });
      continue;
    }
    if (action === "login") {
      await runCityLoginCommand({});
      continue;
    }
    if (action === "logout") {
      runCityLogoutCommand();
    }
  }
}

async function promptSelectCityBase(): Promise<TownCityServerProfile | null> {
  const servers = listTownCityServers();
  const response = (await prompts({
    type: "select",
    name: "base_url",
    message: "选择 City base",
    choices: servers.map((server) => ({
      title: server.selected ? `* ${server.name}` : server.name,
      description: `${server.source} · ${server.base_url}`,
      value: server.base_url,
    })),
    initial: Math.max(0, servers.findIndex((server) => server.selected)),
  })) as { base_url?: string };
  const base_url = readString(response.base_url);
  if (!base_url) return null;
  return servers.find((server) => server.base_url === base_url) ?? null;
}
