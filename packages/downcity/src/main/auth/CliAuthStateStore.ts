/**
 * CLI 认证状态本地存储模块。
 *
 * 关键点（中文）
 * - 使用 console 级加密配置表保存 CLI 当前 Bearer Token。
 * - 认证状态只代表“调用身份”，不承载 session/chat 执行上下文。
 * - 统一提供 `--token > DC_AUTH_TOKEN > DC_AGENT_TOKEN > 本地存储` 的解析顺序。
 */

import fs from "fs-extra";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getConsoleShipDbPath } from "@/main/runtime/ConsolePaths.js";
import type { CliAuthState } from "@/types/auth/CliAuthState.js";
import {
  formatBearerHeaderValue,
  normalizeBearerToken,
  resolveInvocationToken,
} from "./AuthEnv.js";
import { ensureConsoleStoreSchema } from "@/utils/store/StoreSchema.js";
import {
  getSecureSettingJsonSync,
  removeSecureSetting,
  setSecureSettingJsonSync,
} from "@/utils/store/StoreSecureSettings.js";
import { nowIso, type ConsoleStoreContext } from "@/utils/store/StoreShared.js";

const CLI_AUTH_STATE_KEY = "cli:auth:state";

/**
 * CLI 认证状态存储参数。
 */
export interface CliAuthStateStoreOptions {
  /**
   * Console SQLite 数据库路径（可选，默认 `~/.downcity/downcity.db`）。
   */
  dbPath?: string;
}
function withConsoleStore<T>(
  options: CliAuthStateStoreOptions,
  callback: (context: ConsoleStoreContext) => T,
): T {
  const dbPath = path.resolve(options.dbPath || getConsoleShipDbPath());
  fs.ensureDirSync(path.dirname(dbPath));
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const context: ConsoleStoreContext = {
    sqlite,
    db: drizzle(sqlite),
  };
  ensureConsoleStoreSchema(context);
  try {
    return callback(context);
  } finally {
    sqlite.close();
  }
}

function withConsoleStoreReadonly<T>(
  options: CliAuthStateStoreOptions,
  callback: (context: ConsoleStoreContext) => T,
): T | null {
  const dbPath = path.resolve(options.dbPath || getConsoleShipDbPath());
  if (!fs.existsSync(dbPath)) return null;
  const sqlite = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
  const context: ConsoleStoreContext = {
    sqlite,
    db: drizzle(sqlite),
  };
  try {
    return callback(context);
  } finally {
    sqlite.close();
  }
}

/**
 * 读取 CLI 本地认证状态。
 */
export function readCliAuthState(
  options: CliAuthStateStoreOptions = {},
): CliAuthState | null {
  try {
    return withConsoleStoreReadonly(options, (context) => {
      const stored = getSecureSettingJsonSync<Partial<CliAuthState>>(context, CLI_AUTH_STATE_KEY);
      const token = normalizeBearerToken(stored?.token);
      if (!token) return null;
      const username = String(stored?.username || "").trim();
      const source = String(stored?.source || "").trim();
      const updatedAt = String(stored?.updatedAt || "").trim() || nowIso();
      return {
        token,
        ...(username ? { username } : {}),
        ...(source === "bootstrap" || source === "login" || source === "manual" || source === "runtime"
          ? { source }
          : {}),
        updatedAt,
      };
    });
  } catch {
    return null;
  }
}

/**
 * 写入 CLI 本地认证状态。
 */
export function writeCliAuthState(
  input: {
    token: string;
    username?: string;
    source?: CliAuthState["source"];
  },
  options: CliAuthStateStoreOptions = {},
): CliAuthState {
  const token = normalizeBearerToken(input.token);
  if (!token) {
    throw new Error("CLI auth token cannot be empty");
  }
  const username = String(input.username || "").trim();
  const source = input.source;
  const nextState: CliAuthState = {
    token,
    ...(username ? { username } : {}),
    ...(source ? { source } : {}),
    updatedAt: nowIso(),
  };
  withConsoleStore(options, (context) => {
    setSecureSettingJsonSync(context, CLI_AUTH_STATE_KEY, nextState);
  });
  return nextState;
}

/**
 * 清理 CLI 本地认证状态。
 */
export function clearCliAuthState(
  options: CliAuthStateStoreOptions = {},
): void {
  withConsoleStore(options, (context) => {
    removeSecureSetting(context, CLI_AUTH_STATE_KEY);
  });
}

/**
 * 解析当前 CLI 应使用的 Bearer Token。
 *
 * 优先级（中文）
 * 1. 显式传入 token
 * 2. 环境变量 `DC_AUTH_TOKEN`
 * 3. 环境变量 `DC_AGENT_TOKEN`（Agent 专用 token）
 * 4. 本地加密存储中的 CLI 登录态
 */
export function resolveCliAuthToken(params: {
  explicitToken?: string;
  env?: NodeJS.ProcessEnv;
  dbPath?: string;
} = {}): string | undefined {
  const directToken = resolveInvocationToken({
    explicitToken: params.explicitToken,
    env: params.env,
  });
  if (directToken) return directToken;

  return resolveInvocationToken({
    storedToken: readCliAuthState({
      dbPath: params.dbPath,
    })?.token,
  });
}

/**
 * 生成标准 Authorization 头值。
 */
export function formatCliBearerHeaderValue(tokenInput: string | undefined): string | undefined {
  return formatBearerHeaderValue(tokenInput);
}
