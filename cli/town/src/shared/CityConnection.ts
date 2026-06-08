/**
 * Town City user 连接管理服务。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `town` CLI 自己维护 user 登录态，避免把 user token 复制到 city 状态。
 * - Town 可以只读发现 `city` CLI 已配置的 base 地址，但不依赖 city 内部模块。
 * - CLI 命令装配统一放在 `src/command/CityCommand.ts`，本模块只保留状态与登录流程。
 */

import prompts from "prompts";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { performTownCityUserLogin } from "./CityUserLogin.js";
import {
  emitCurrentTownCityBalance,
  emitTownCityRechargeResult,
  rechargeCurrentTownCityUser,
} from "./CityBalance.js";
import { CityUserManager } from "./CityUserManager.js";
import type {
  TownCityConnectionState,
  TownCityServerProfile,
} from "../types/TownCityConnection.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import {
  DEFAULT_CITY_URL,
  DEFAULT_TOWN_ID,
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
import { getCliLocale, t } from "./CliLocale.js";
import { promptAndPersistTownCliLocale } from "./InteractiveLocale.js";
const cityUserManager = new CityUserManager();

function readString(value: unknown): string {
  return readCityString(value);
}

export function readTownCityAdminSecretForBase(city_url: string): string | undefined {
  return readCityAdminSecretForUrl(city_url);
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

export async function emitCityUserWhoami(options?: { as_json?: boolean }): Promise<void> {
  try {
    const user = await cityUserManager.resolveCurrentUser();
    if (options?.as_json === true) {
      printResult({
        asJson: true,
        success: true,
        title: "city user",
        payload: {
          city_url: user.city_url,
          town_id: user.town_id,
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
      title: "City user",
      summary: user.source,
      facts: [
        { label: "url", value: user.city_url },
        { label: "town", value: user.town_id },
        { label: "user", value: user.user_id || "unknown" },
        ...(user.user_label ? [{ label: "label", value: user.user_label }] : []),
        { label: "source", value: user.source },
        { label: "env url", value: user.env_overrides.city_url ? "yes" : "no" },
        { label: "env town", value: user.env_overrides.town_id ? "yes" : "no" },
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
      title: "City user unavailable",
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
  const current_locale = getCliLocale();
  const persisted_locale = readPersistedTownCliLocale();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: t({
      zh: "管理 City user 连接",
      en: "Manage City user connections",
    }),
    choices: [
      {
        title: t({
          zh: "查看连接状态",
          en: "View connection status",
        }),
        description: state.city_url,
        value: "status",
      },
      {
        title: t({
          zh: "选择 City base",
          en: "Select City base",
        }),
        description: t({
          zh: "从 Town / city admin / 默认 base 候选中选择",
          en: "Choose from Town, city admin, or default base candidates",
        }),
        value: "use",
      },
      {
        title: t({
          zh: "添加 City base",
          en: "Add City base",
        }),
        description: t({
          zh: "手动写入一个 Town user base",
          en: "Manually add a Town user base",
        }),
        value: "connect",
      },
      {
        title: t({
          zh: "User 登录",
          en: "User login",
        }),
        description: state.has_user_token
          ? t({ zh: "重新登录当前 base", en: "Sign in again to the current base" })
          : t({ zh: "登录当前 base", en: "Sign in to the current base" }),
        value: "login",
      },
      {
        title: t({
          zh: "查看当前 User",
          en: "View current user",
        }),
        description: t({
          zh: "显示 Town 当前实际使用的 City user",
          en: "Show the current City user resolved by Town",
        }),
        value: "whoami",
      },
      {
        title: t({
          zh: "查看 User 余额",
          en: "View user balance",
        }),
        description: state.has_user_token
          ? t({ zh: "读取当前登录 user 的余额", en: "Read the balance of the current signed-in user" })
          : t({ zh: "需要先登录 user", en: "A user login is required first" }),
        value: "balance",
      },
      {
        title: t({
          zh: "User 充值",
          en: "User recharge",
        }),
        description: state.has_user_token
          ? t({ zh: "给当前登录 user 发起 checkout 充值", en: "Start a checkout recharge for the current signed-in user" })
          : t({ zh: "需要先登录 user", en: "A user login is required first" }),
        value: "recharge",
      },
      {
        title: t({
          zh: "User 登出",
          en: "User logout",
        }),
        description: t({
          zh: "清除当前 base 的 Town user session",
          en: "Clear the Town user session for the current base",
        }),
        value: "logout",
      },
      {
        title: t({
          zh: "查看可用 base",
          en: "List available bases",
        }),
        description: t({
          zh: "包含默认 base 与 city admin 已保存 base",
          en: "Includes the default base and city-admin saved bases",
        }),
        value: "list",
      },
      {
        title: t({
          zh: "切换语言",
          en: "Language",
        }),
        description: formatTownCliLocaleDescription(persisted_locale ?? current_locale),
        value: "language",
      },
      {
        title: t({
          zh: "退出",
          en: "Exit",
        }),
        description: t({
          zh: "关闭 City user 连接管理",
          en: "Close City user connection management",
        }),
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
        title: t({
          zh: "City 管理器已关闭",
          en: "City manager closed",
        }),
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
    if (action === "whoami") {
      await emitCityUserWhoami();
      continue;
    }
    if (action === "balance") {
      await emitCurrentTownCityBalance();
      continue;
    }
    if (action === "recharge") {
      const input = await promptRechargeInput();
      if (input) {
        const result = await rechargeCurrentTownCityUser(input);
        if (result) emitTownCityRechargeResult(result);
      }
      continue;
    }
    if (action === "language") {
      await promptAndPersistTownCliLocale();
      continue;
    }
    if (action === "logout") {
      runCityLogoutCommand();
      continue;
    }
  }
}

function formatTownCliLocaleDescription(cli_locale: "zh" | "en"): string {
  if (cli_locale === "zh") {
    return t({
      zh: "当前默认语言：中文",
      en: "Current default language: Chinese",
    });
  }

  return t({
    zh: "当前默认语言：英文",
    en: "Current default language: English",
  });
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

async function promptRechargeInput(): Promise<{
  amount: number;
  method_id?: string;
  note?: string;
  open_checkout?: boolean;
} | null> {
  const response = (await prompts([
    {
      type: "number",
      name: "amount",
      message: "充值金额",
      min: 1,
      validate: (value: number) =>
        Number.isInteger(value) && value > 0 ? true : "请输入正整数",
    },
    {
      type: "text",
      name: "note",
      message: "说明（可选）",
      initial: "Town user recharge",
    },
    {
      type: "confirm",
      name: "open_checkout",
      message: "创建后打开支付页面？",
      initial: true,
    },
  ])) as {
    amount?: number;
    note?: string;
    open_checkout?: boolean;
  };

  const amount = Number(response.amount);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  return {
    amount,
    method_id: "stripe",
    note: readString(response.note),
    open_checkout: response.open_checkout !== false,
  };
}
