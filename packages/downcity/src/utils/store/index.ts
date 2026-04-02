/**
 * ConsoleStore 门面。
 *
 * 关键点（中文）
 * - 对外仍然只暴露一个 `ConsoleStore` 类，保持调用入口稳定。
 * - 内部已经按职责拆成 schema、model/provider、secure settings、env、channel accounts 多个模块。
 * - 这样既能保持外部 API 简洁，也能把通用存储层控制在可维护的模块粒度内。
 */

import fs from "fs-extra";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getConsoleShipDbPath } from "@/main/runtime/ConsolePaths.js";
import { ensureConsoleStoreSchema } from "./StoreSchema.js";
import type { ConsoleStoreContext } from "./StoreShared.js";
import type {
  StoredAgentEnvEntry,
  StoredChannelAccount,
  StoredEnvEntry,
  StoredEnvScope,
  StoredGlobalEnvEntry,
  StoredModel,
  StoredModelProvider,
  UpsertAgentEnvEntryInput,
  UpsertChannelAccountInput,
  UpsertEnvEntryInput,
  UpsertGlobalEnvEntryInput,
  UpsertModelInput,
  UpsertModelProviderInput,
} from "@/types/Store.js";
import {
  getConsoleRootDirPath,
} from "@/main/runtime/ConsolePaths.js";
import {
  clearStoredModelsAndProviders,
  getResolvedStoredModel,
  getStoredModel,
  getStoredProvider,
  listStoredModels,
  listStoredProviders,
  removeStoredModel,
  removeStoredProvider,
  setStoredModelPaused,
  upsertStoredModel,
  upsertStoredProvider,
} from "./StoreModelRepository.js";
import {
  buildAgentSecureSettingKey,
  getSecureSettingJson,
  getSecureSettingJsonSync,
  removeSecureSetting,
  setSecureSettingJson,
  setSecureSettingJsonSync,
} from "./StoreSecureSettings.js";
import {
  clearAgentEnvEntries,
  clearGlobalEnvEntries,
  getAgentEnvMap,
  getAgentEnvMapSync,
  getGlobalEnvMap,
  getGlobalEnvMapSync,
  listAgentEnvEntries,
  listAgentEnvEntriesSync,
  listAllAgentEnvEntries,
  listEnvEntries,
  listEnvEntriesSync,
  listGlobalEnvEntries,
  listGlobalEnvEntriesSync,
  removeAgentEnvEntry,
  removeEnvEntry,
  removeGlobalEnvEntry,
  upsertAgentEnvEntry,
  upsertEnvEntry,
  upsertGlobalEnvEntry,
} from "./StoreEnvRepository.js";
import {
  getChannelAccount,
  getChannelAccountSync,
  listChannelAccounts,
  listChannelAccountsSync,
  removeChannelAccount,
  upsertChannelAccount,
} from "./StoreChannelAccountRepository.js";

/**
 * Console 模型存储。
 */
export class ConsoleStore {
  private readonly sqlite: Database.Database;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(dbPath: string = getConsoleShipDbPath()) {
    fs.ensureDirSync(getConsoleRootDirPath());
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.db = drizzle(this.sqlite);
    ensureConsoleStoreSchema(this.context);
  }

  /**
   * 暴露给内部 helper 的只读上下文视图。
   */
  private get context(): ConsoleStoreContext {
    return {
      sqlite: this.sqlite,
      db: this.db,
    };
  }

  /**
   * 关闭连接。
   */
  close(): void {
    this.sqlite.close();
  }

  /**
   * 列出 providers。
   */
  async listProviders(): Promise<StoredModelProvider[]> {
    return await listStoredProviders(this.context);
  }

  /**
   * 获取单个 provider。
   */
  async getProvider(providerId: string): Promise<StoredModelProvider | null> {
    return await getStoredProvider(this.context, providerId);
  }

  /**
   * 新增或更新 provider。
   */
  async upsertProvider(input: UpsertModelProviderInput): Promise<void> {
    await upsertStoredProvider(this.context, input);
  }

  /**
   * 删除 provider。
   */
  removeProvider(providerId: string): void {
    removeStoredProvider(this.context, providerId);
  }

  /**
   * 列出 models。
   */
  listModels(): StoredModel[] {
    return listStoredModels(this.context);
  }

  /**
   * 获取单个 model。
   */
  getModel(modelId: string): StoredModel | null {
    return getStoredModel(this.context, modelId);
  }

  /**
   * 新增或更新 model。
   */
  upsertModel(input: UpsertModelInput): void {
    upsertStoredModel(this.context, input);
  }

  /**
   * 切换模型暂停状态。
   */
  setModelPaused(modelId: string, paused: boolean): void {
    setStoredModelPaused(this.context, modelId, paused);
  }

  /**
   * 删除 model。
   */
  removeModel(modelId: string): void {
    removeStoredModel(this.context, modelId);
  }

  /**
   * 获取 model + provider 聚合信息。
   */
  async getResolvedModel(modelId: string): Promise<{
    model: StoredModel;
    provider: StoredModelProvider;
  } | null> {
    return await getResolvedStoredModel(this.context, modelId);
  }

  /**
   * 清空所有存储数据。
   */
  clearAll(): void {
    clearStoredModelsAndProviders(this.context);
    this.sqlite.exec("DELETE FROM console_secure_settings;");
    this.sqlite.exec("DELETE FROM env_entries;");
    this.sqlite.exec("DELETE FROM global_env;");
    this.sqlite.exec("DELETE FROM agent_env;");
    this.sqlite.exec("DELETE FROM channel_accounts;");
  }

  /**
   * 同步读取 console 加密配置项（JSON）。
   */
  getSecureSettingJsonSync<T>(key: string): T | null {
    return getSecureSettingJsonSync<T>(this.context, key);
  }

  /**
   * 同步写入 console 加密配置项（JSON）。
   */
  setSecureSettingJsonSync(key: string, value: unknown): void {
    setSecureSettingJsonSync(this.context, key, value);
  }

  /**
   * 删除 console 加密配置项。
   */
  removeSecureSetting(key: string): void {
    removeSecureSetting(this.context, key);
  }

  /**
   * 异步读取 console 加密配置项（JSON）。
   */
  async getSecureSettingJson<T>(key: string): Promise<T | null> {
    return await getSecureSettingJson<T>(this.context, key);
  }

  /**
   * 异步写入 console 加密配置项（JSON）。
   */
  async setSecureSettingJson(key: string, value: unknown): Promise<void> {
    await setSecureSettingJson(this.context, key, value);
  }

  /**
   * 同步读取 agent 加密配置项（JSON）。
   */
  getAgentSecureSettingJsonSync<T>(agentIdInput: string, keyInput: string): T | null {
    return this.getSecureSettingJsonSync<T>(
      buildAgentSecureSettingKey(agentIdInput, keyInput),
    );
  }

  /**
   * 同步写入 agent 加密配置项（JSON）。
   */
  setAgentSecureSettingJsonSync(agentIdInput: string, keyInput: string, value: unknown): void {
    this.setSecureSettingJsonSync(
      buildAgentSecureSettingKey(agentIdInput, keyInput),
      value,
    );
  }

  /**
   * 删除 agent 加密配置项。
   */
  removeAgentSecureSetting(agentIdInput: string, keyInput: string): void {
    this.removeSecureSetting(buildAgentSecureSettingKey(agentIdInput, keyInput));
  }

  /**
   * 异步读取 agent 加密配置项（JSON）。
   */
  async getAgentSecureSettingJson<T>(
    agentIdInput: string,
    keyInput: string,
  ): Promise<T | null> {
    return await this.getSecureSettingJson<T>(
      buildAgentSecureSettingKey(agentIdInput, keyInput),
    );
  }

  /**
   * 异步写入 agent 加密配置项（JSON）。
   */
  async setAgentSecureSettingJson(
    agentIdInput: string,
    keyInput: string,
    value: unknown,
  ): Promise<void> {
    await this.setSecureSettingJson(
      buildAgentSecureSettingKey(agentIdInput, keyInput),
      value,
    );
  }

  /**
   * 查询 env 条目（同步）。
   */
  listEnvEntriesSync(scopeInput?: StoredEnvScope, agentIdInput?: string): StoredEnvEntry[] {
    return listEnvEntriesSync(this.context, scopeInput, agentIdInput);
  }

  /**
   * 查询 env 条目（异步）。
   */
  async listEnvEntries(scopeInput?: StoredEnvScope, agentIdInput?: string): Promise<StoredEnvEntry[]> {
    return await listEnvEntries(this.context, scopeInput, agentIdInput);
  }

  /**
   * 新增或更新 env 条目。
   */
  async upsertEnvEntry(input: UpsertEnvEntryInput): Promise<void> {
    await upsertEnvEntry(this.context, input);
  }

  /**
   * 删除单个 env 条目。
   */
  removeEnvEntry(input: { scope: StoredEnvScope; agentId?: string; key: string }): void {
    removeEnvEntry(this.context, input);
  }

  /**
   * 列出全局环境变量（同步解密）。
   */
  listGlobalEnvEntriesSync(): StoredGlobalEnvEntry[] {
    return listGlobalEnvEntriesSync(this.context);
  }

  /**
   * 读取全局环境变量映射（同步解密）。
   */
  getGlobalEnvMapSync(): Record<string, string> {
    return getGlobalEnvMapSync(this.context);
  }

  /**
   * 列出全局环境变量（解密后）。
   */
  async listGlobalEnvEntries(): Promise<StoredGlobalEnvEntry[]> {
    return await listGlobalEnvEntries(this.context);
  }

  /**
   * 读取全局环境变量映射（解密后）。
   */
  async getGlobalEnvMap(): Promise<Record<string, string>> {
    return await getGlobalEnvMap(this.context);
  }

  /**
   * 新增或更新全局环境变量。
   */
  async upsertGlobalEnvEntry(input: UpsertGlobalEnvEntryInput): Promise<void> {
    await upsertGlobalEnvEntry(this.context, input);
  }

  /**
   * 删除单个全局环境变量。
   */
  removeGlobalEnvEntry(keyInput: string): void {
    removeGlobalEnvEntry(this.context, keyInput);
  }

  /**
   * 清空全局环境变量。
   */
  clearGlobalEnvEntries(): void {
    clearGlobalEnvEntries(this.context);
  }

  /**
   * 列出指定 agent 的私有环境变量（同步解密）。
   */
  listAgentEnvEntriesSync(agentIdInput: string): StoredAgentEnvEntry[] {
    return listAgentEnvEntriesSync(this.context, agentIdInput);
  }

  /**
   * 读取指定 agent 的私有环境变量映射（同步解密）。
   */
  getAgentEnvMapSync(agentIdInput: string): Record<string, string> {
    return getAgentEnvMapSync(this.context, agentIdInput);
  }

  /**
   * 列出指定 agent 的私有环境变量（解密后）。
   */
  async listAgentEnvEntries(agentIdInput: string): Promise<StoredAgentEnvEntry[]> {
    return await listAgentEnvEntries(this.context, agentIdInput);
  }

  /**
   * 列出全部 agent 私有环境变量（解密后）。
   */
  async listAllAgentEnvEntries(): Promise<StoredAgentEnvEntry[]> {
    return await listAllAgentEnvEntries(this.context);
  }

  /**
   * 读取指定 agent 的私有环境变量映射（解密后）。
   */
  async getAgentEnvMap(agentIdInput: string): Promise<Record<string, string>> {
    return await getAgentEnvMap(this.context, agentIdInput);
  }

  /**
   * 新增或更新 agent 私有环境变量。
   */
  async upsertAgentEnvEntry(input: UpsertAgentEnvEntryInput): Promise<void> {
    await upsertAgentEnvEntry(this.context, input);
  }

  /**
   * 删除指定 agent 的单个环境变量。
   */
  removeAgentEnvEntry(agentIdInput: string, keyInput: string): void {
    removeAgentEnvEntry(this.context, agentIdInput, keyInput);
  }

  /**
   * 清空指定 agent 的私有环境变量。
   */
  clearAgentEnvEntries(agentIdInput: string): void {
    clearAgentEnvEntries(this.context, agentIdInput);
  }

  /**
   * 列出 channel accounts（同步解密）。
   */
  listChannelAccountsSync(channelInput?: string): StoredChannelAccount[] {
    return listChannelAccountsSync(this.context, channelInput);
  }

  /**
   * 按 ID 获取 channel account（同步解密）。
   */
  getChannelAccountSync(accountIdInput: string): StoredChannelAccount | null {
    return getChannelAccountSync(this.context, accountIdInput);
  }

  /**
   * 列出 channel accounts（解密后）。
   */
  async listChannelAccounts(channelInput?: string): Promise<StoredChannelAccount[]> {
    return await listChannelAccounts(this.context, channelInput);
  }

  /**
   * 按 ID 获取 channel account（解密后）。
   */
  async getChannelAccount(accountIdInput: string): Promise<StoredChannelAccount | null> {
    return await getChannelAccount(this.context, accountIdInput);
  }

  /**
   * 新增或更新 channel account。
   */
  async upsertChannelAccount(input: UpsertChannelAccountInput): Promise<void> {
    await upsertChannelAccount(this.context, input);
  }

  /**
   * 删除 channel account。
   */
  removeChannelAccount(accountIdInput: string): void {
    removeChannelAccount(this.context, accountIdInput);
  }
}

/**
 * 在 ConsoleStore 上下文中执行操作。
 *
 * 关键点（中文）
 * - 用于一次性数据库操作，无需手动管理 ConsoleStore 实例生命周期。
 * - 自动处理数据库连接和关闭。
 */
export function withConsoleStore<T>(callback: (context: ConsoleStoreContext) => T): T {
  const dbPath = getConsoleShipDbPath();
  fs.ensureDirSync(dbPath.replace(/\/[^/]+$/, ""));
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
