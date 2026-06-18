/**
 * Town City user 连接管理服务。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `town` CLI 自己维护 user 登录态，避免把 user token 复制到 city 状态。
 * - Town 可以只读发现 `city` CLI 已配置的 base 地址，但不依赖 city 内部模块。
 * - CLI 命令装配统一放在 `src/command/CityCommand.ts`，本模块只保留状态与登录流程。
 */

import { emitCliBlock, emitCliList } from "../../shared/CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { performTownCityUserLogin } from "./CityUserLogin.js";
import { open_city_manager_tui } from "../tui/CityManagerTui.js";
import prompts from "../tui/Prompts.js";
import { CityUserManager } from "./CityUserManager.js";
import type {
  TownCityConnectionState,
  TownCityServerProfile,
} from "../types/TownCityConnection.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import {
  DEFAULT_FEDERATION_URL,
  DEFAULT_CITY_ID,
  listTownCityServers,
  normalizeCityUrl,
  readCityAdminSecretForUrl,
  readCityString,
  readCurrentTownCitySession,
  readPersistedTownCliLocale,
  readTownCityState,
  resolveSelectedBaseUrl,
  upsertTownProfile,
  writeTownCityState,
} from "./CityStateStore.js";
const cityUserManager = new CityUserManager();

function readString(value: unknown): string {
  return readCityString(value);
}

export function readTownCityAdminSecretForBase(federation_url: string): string | undefined {
  return readCityAdminSecretForUrl(federation_url);
}

function findTownCityServer(input?: string): TownCityServerProfile | null {
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

export function readTownCityConnectionState(): TownCityConnectionState {
  const state = readTownCityState();
  const federation_url = resolveSelectedBaseUrl(state);
  const session = state.sessions?.[federation_url] ?? null;
  if (session?.user_token) {
    return {
      federation_url,
      city_id: session.city_id || DEFAULT_CITY_ID,
      has_user_token: true,
      source: "town-session",
      user_id: session.user_id,
      user_label: session.user_label,
    };
  }

  const server = listTownCityServers().find((item) => item.base_url === federation_url);
  return {
    federation_url,
    city_id: DEFAULT_CITY_ID,
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
    summary: state.has_user_token ? "signed in" : "city selected",
    facts: [
      { label: "url", value: state.federation_url },
      { label: "town", value: state.city_id },
      { label: "user token", value: state.has_user_token ? "configured" : "missing" },
      { label: "source", value: state.source },
      ...(state.user_id ? [{ label: "user", value: state.user_id }] : []),
    ],
    note: state.has_user_token
      ? undefined
      : "Run `town city login` to sign in.",
  });
}

export async function emitCityUserWhoami(options?: { as_json?: boolean }): Promise<void> {
  try {
    const user = await cityUserManager.resolveCurrentUser();
    if (options?.as_json === true) {
      printResult({
        asJson: true,
        success: true,
        title: "city user",
        payload: {
          federation_url: user.federation_url,
          city_id: user.city_id,
          user_id: user.user_id,
          user_label: user.user_label,
          source: user.source,
          env_overrides: user.env_overrides,
          warnings: user.warnings,
        },
      });
      return;
    }

    emitCliBlock({
      tone: "success",
      title: "City account",
      summary: user.source,
      facts: [
        { label: "url", value: user.federation_url },
        { label: "town", value: user.city_id },
        { label: "user", value: user.user_id || "unknown" },
        ...(user.user_label ? [{ label: "label", value: user.user_label }] : []),
        { label: "source", value: user.source },
        { label: "env url", value: user.env_overrides.federation_url ? "yes" : "no" },
        { label: "env town", value: user.env_overrides.city_id ? "yes" : "no" },
        { label: "env token", value: user.env_overrides.user_token ? "yes" : "no" },
      ],
      note: user.warnings.join(" ") || undefined,
    });
  } catch (error) {
    if (options?.as_json === true) {
      printResult({
        asJson: true,
        success: false,
        title: "city user",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    emitCliBlock({
      tone: "error",
      title: "City account unavailable",
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

export function emitCityServerList(options?: { as_json?: boolean }): void {
  const servers = listTownCityServers();
  if (options?.as_json === true) {
    printResult({
      asJson: true,
      success: true,
      title: "templates",
      payload: {
        count: servers.length,
        servers,
      },
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "Cities",
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
  let federation_url = normalizeCityUrl(String(params.url || ""));

  if (!federation_url && process.stdin.isTTY && process.stdout.isTTY) {
    const response = (await prompts({
      type: "text",
      name: "federation_url",
      message: "City URL",
      initial: DEFAULT_FEDERATION_URL,
    })) as { federation_url?: string };
    federation_url = normalizeCityUrl(String(response.federation_url || ""));
  }

  if (!federation_url) federation_url = DEFAULT_FEDERATION_URL;

  const state = upsertTownProfile(readTownCityState(), { base_url: federation_url });
  writeTownCityState(state);

  printResult({
    asJson: params.as_json === true,
    success: true,
    title: "city connected",
    payload: {
      federation_url,
      fix: "Run `town city login` to sign in as a user.",
    },
  });
}

export async function runCityUseCommand(params: {
  server?: string;
  as_json?: boolean;
}): Promise<void> {
  const server = findTownCityServer(params.server);
  if (!server) {
    printResult({
      asJson: params.as_json === true,
      success: false,
      title: "city use failed",
      payload: {
        error: "No City matched the input",
        fix: "Run `town city list` to inspect available Cities.",
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
    title: "city selected",
    payload: {
      federation_url: server.base_url,
      source: server.source,
      has_user_session: server.has_user_session,
      fix: server.has_user_session ? undefined : "Run `town city login` to sign in as a user.",
    },
  });
}

function saveTownCityUserSession(session: TownCityUserSession): void {
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
  city_id?: string;
  as_json?: boolean;
}): Promise<void> {
  if (params.url) {
    const federation_url = normalizeCityUrl(params.url);
    if (federation_url) {
      writeTownCityState(upsertTownProfile(readTownCityState(), { base_url: federation_url }));
    }
  }
  const state = readTownCityState();
  const federation_url = resolveSelectedBaseUrl(state);
  const city_id = readString(params.city_id) || readCurrentTownCitySession()?.city_id || DEFAULT_CITY_ID;
  const session = await performTownCityUserLogin({
    federation_url,
    city_id,
  });
  if (!session) {
    printResult({
      asJson: params.as_json === true,
      success: false,
      title: "city login cancelled",
      payload: { federation_url },
    });
    return;
  }

  saveTownCityUserSession(session);
  printResult({
    asJson: params.as_json === true,
    success: true,
    title: "city user signed in",
    payload: {
      federation_url: session.base_url,
      city_id: session.city_id,
      user_id: session.user_id,
      user_label: session.user_label,
    },
  });
}

export function runCityLogoutCommand(options?: { as_json?: boolean }): void {
  const state = readTownCityState();
  const federation_url = resolveSelectedBaseUrl(state);
  const sessions = { ...(state.sessions ?? {}) };
  delete sessions[federation_url];
  writeTownCityState({
    ...state,
    sessions,
  });
  printResult({
    asJson: options?.as_json === true,
    success: true,
    title: "city user signed out",
    payload: {
      federation_url,
    },
  });
}

export function runCityDisconnectCommand(options?: { as_json?: boolean }): void {
  const state = readTownCityState();
  const federation_url = resolveSelectedBaseUrl(state);
  const profiles = (state.profiles ?? []).filter((profile) => profile.base_url !== federation_url);
  const sessions = { ...(state.sessions ?? {}) };
  delete sessions[federation_url];
  writeTownCityState({
    ...state,
    selected_base_url: DEFAULT_FEDERATION_URL,
    profiles,
    sessions,
  });
  printResult({
    asJson: options?.as_json === true,
    success: true,
    title: "city base disconnected",
    payload: {
      removed: federation_url,
      selected: DEFAULT_FEDERATION_URL,
    },
  });
}

export async function runInteractiveCityManager(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  await open_city_manager_tui();
}
