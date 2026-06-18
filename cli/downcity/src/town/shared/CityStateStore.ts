/**
 * Town City 本地状态存储。
 *
 * 关键点（中文）
 * - 只负责读取/写入 Town 自己保存的 City base 与 user session。
 * - 同时提供只读发现 `city` CLI admin base 配置的能力。
 * - 不包含交互菜单、输出渲染或用户身份校验逻辑。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PlatformStore } from "../town/store/index.js";
import type { TownCityServerProfile } from "../types/TownCityConnection.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import type { CliLocale } from "../../types/CliLocale.js";
import type {
  CityAdminConfig,
  TownCityLocalProfile,
  TownCityLocalState,
} from "../types/TownCityState.js";

export const DEFAULT_CITY_URL = "https://base.downcity.ai";
export const DEFAULT_TOWN_ID = "town_downcity";

const CITY_CONFIG_PATH = path.join(os.homedir(), ".downcity", "config.json");
const TOWN_CITY_STATE_KEY = "town.city.state";

/**
 * 读取字符串字段。
 */
export function readCityString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 规范化 City base URL。
 */
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

/**
 * 读取 Town City 本地状态。
 */
export function readTownCityState(): TownCityLocalState {
  const store = new PlatformStore();
  try {
    return normalizeLocalState(
      store.getSecureSettingJsonSync<TownCityLocalState>(TOWN_CITY_STATE_KEY),
    );
  } finally {
    store.close();
  }
}

/**
 * 写入 Town City 本地状态。
 */
export function writeTownCityState(state: TownCityLocalState): void {
  const store = new PlatformStore();
  try {
    store.setSecureSettingJsonSync(TOWN_CITY_STATE_KEY, normalizeLocalState(state));
  } finally {
    store.close();
  }
}

/**
 * 读取 Town 持久化的 CLI 语言。
 */
export function readPersistedTownCliLocale(): CliLocale | undefined {
  return readTownCityState().cli_locale;
}

/**
 * 写入 Town 持久化的 CLI 语言。
 */
export function writePersistedTownCliLocale(cli_locale: CliLocale): void {
  const state = readTownCityState();
  writeTownCityState({
    ...state,
    cli_locale,
  });
}

/**
 * 读取当前选中的 City base URL。
 */
export function resolveSelectedBaseUrl(state: TownCityLocalState = readTownCityState()): string {
  return normalizeCityUrl(readCityString(state.selected_base_url)) || DEFAULT_CITY_URL;
}

/**
 * 读取当前选中 base 的 user session。
 */
export function readCurrentTownCitySession(): TownCityUserSession | null {
  const state = readTownCityState();
  const base_url = resolveSelectedBaseUrl(state);
  return state.sessions?.[base_url] ?? null;
}

/**
 * 读取指定 City base 的 user session。
 */
export function readTownCitySessionForBase(city_url: string): TownCityUserSession | null {
  const state = readTownCityState();
  const base_url = normalizeCityUrl(city_url);
  if (!base_url) return null;
  return state.sessions?.[base_url] ?? null;
}

/**
 * 添加或更新 Town 本地 City base。
 */
export function upsertTownProfile(state: TownCityLocalState, input: {
  /**
   * City base URL。
   */
  base_url: string;

  /**
   * 可选展示名。
   */
  name?: string;
}): TownCityLocalState {
  const base_url = normalizeCityUrl(input.base_url);
  if (!base_url) return state;
  const profiles = [...(state.profiles ?? [])];
  const index = profiles.findIndex((item) => item.base_url === base_url);
  const profile = {
    name: readCityString(input.name) || deriveServerName(base_url),
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

/**
 * 列出 Town 可选择的 City base。
 */
export function listTownCityServers(): TownCityServerProfile[] {
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

/**
 * 读取指定 City base 的 admin secret。
 */
export function readCityAdminSecretForUrl(city_url: string): string | undefined {
  const target_url = normalizeCityUrl(city_url);
  const raw = readCityAdminConfig();
  const servers = Array.isArray(raw.servers) ? raw.servers : [];
  const matched = servers.find((item) =>
    normalizeCityUrl(readCityString(item.base_url) || readCityString(item.url)) === target_url,
  );
  return readCityString(matched?.admin_secret_key) || undefined;
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

function readCityAdminConfig(): CityAdminConfig {
  return readJsonFile<CityAdminConfig>(CITY_CONFIG_PATH) ?? {};
}

function readCityAdminServers(): TownCityServerProfile[] {
  const raw = readCityAdminConfig();
  const servers = Array.isArray(raw.servers) ? raw.servers : [];
  const active_url = normalizeCityUrl(readCityString(raw.active_server_url));
  const out: TownCityServerProfile[] = [];
  const state = readTownCityState();
  const selected_base_url = resolveSelectedBaseUrl(state);

  for (const item of servers) {
    const base_url = normalizeCityUrl(readCityString(item.base_url) || readCityString(item.url));
    if (!base_url || out.some((server) => server.base_url === base_url)) continue;
    const session = state.sessions?.[base_url];
    out.push({
      name: readCityString(item.name) || deriveServerName(base_url),
      base_url,
      selected: base_url === selected_base_url,
      source: "city-admin",
      has_admin_secret_key: Boolean(readCityString(item.admin_secret_key)),
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

function normalizeLocalState(value: TownCityLocalState | null | undefined): TownCityLocalState {
  const selected_base_url = normalizeCityUrl(readCityString(value?.selected_base_url));
  const profiles: TownCityLocalProfile[] = [];
  for (const item of Array.isArray(value?.profiles) ? value.profiles : []) {
    const base_url = normalizeCityUrl(readCityString(item.base_url));
    if (!base_url || profiles.some((profile) => profile.base_url === base_url)) continue;
    profiles.push({
      name: readCityString(item.name) || deriveServerName(base_url),
      base_url,
    });
  }
  const sessions: Record<string, TownCityUserSession> = {};
  const input_sessions = value?.sessions && typeof value.sessions === "object"
    ? value.sessions
    : {};
  for (const [key, session] of Object.entries(input_sessions)) {
    const base_url = normalizeCityUrl(readCityString(session?.base_url) || key);
    const user_token = readCityString(session?.user_token);
    if (!base_url || !user_token) continue;
    sessions[base_url] = {
      base_url,
      town_id: readCityString(session?.town_id) || DEFAULT_TOWN_ID,
      user_id: readCityString(session?.user_id) || undefined,
      user_label: readCityString(session?.user_label) || undefined,
      user_token,
      updated_at: readCityString(session?.updated_at) || new Date().toISOString(),
    };
  }
  return {
    selected_base_url: selected_base_url || undefined,
    cli_locale: normalizeCliLocale(value?.cli_locale),
    profiles,
    sessions,
  };
}

function normalizeCliLocale(value: unknown): CliLocale | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "zh") return "zh";
  if (raw === "en") return "en";
  return undefined;
}
