/**
 * PlatformStore 门面。
 *
 * 关键点（中文）
 * - 对外仍然只暴露一个 `PlatformStore` 类，保持调用入口稳定。
 * - 内部已经按职责拆成 schema、secure settings、env、channel accounts 多个模块。
 * - 这样既能保持外部 API 简洁，也能把通用存储层控制在可维护的模块粒度内。
 */
import fs from "fs-extra";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getPlatformStoreDbPath } from "../../process/registry/TownPaths.js";
import { ensurePlatformStoreSchema } from "./StoreSchema.js";
import { getPlatformRootDirPath, } from "../../process/registry/TownPaths.js";
import { buildAgentSecureSettingKey, getSecureSettingJson, getSecureSettingJsonSync, removeSecureSetting, setSecureSettingJson, setSecureSettingJsonSync, } from "./StoreSecureSettings.js";
import { clearGlobalEnvEntries, getGlobalEnvMap, getGlobalEnvMapSync, listEnvEntries, listEnvEntriesSync, listGlobalEnvEntries, listGlobalEnvEntriesSync, removeEnvEntry, removeGlobalEnvEntry, upsertEnvEntry, upsertGlobalEnvEntry, } from "./StoreEnvRepository.js";
import { getChannelAccount, getChannelAccountSync, listChannelAccounts, listChannelAccountsSync, removeChannelAccount, upsertChannelAccount, } from "./StoreChannelAccountRepository.js";
/**
 * 平台控制面全局存储门面。
 */
export class PlatformStore {
    sqlite;
    db;
    constructor(dbPath = getPlatformStoreDbPath()) {
        fs.ensureDirSync(getPlatformRootDirPath());
        this.sqlite = new Database(dbPath);
        this.sqlite.pragma("foreign_keys = ON");
        this.sqlite.pragma("journal_mode = WAL");
        this.db = drizzle(this.sqlite);
        ensurePlatformStoreSchema(this.context);
    }
    /**
     * 暴露给内部 helper 的只读上下文视图。
     */
    get context() {
        return {
            sqlite: this.sqlite,
            db: this.db,
        };
    }
    /**
     * 关闭连接。
     */
    close() {
        this.sqlite.close();
    }
    /**
     * 清空所有存储数据。
     */
    clearAll() {
        this.sqlite.exec("DELETE FROM platform_secure_settings;");
        this.sqlite.exec("DELETE FROM env_entries;");
        this.sqlite.exec("DELETE FROM channel_accounts;");
    }
    /**
     * 同步读取 console 加密配置项（JSON）。
     */
    getSecureSettingJsonSync(key) {
        return getSecureSettingJsonSync(this.context, key);
    }
    /**
     * 同步写入 console 加密配置项（JSON）。
     */
    setSecureSettingJsonSync(key, value) {
        setSecureSettingJsonSync(this.context, key, value);
    }
    /**
     * 删除 console 加密配置项。
     */
    removeSecureSetting(key) {
        removeSecureSetting(this.context, key);
    }
    /**
     * 异步读取 console 加密配置项（JSON）。
     */
    async getSecureSettingJson(key) {
        return await getSecureSettingJson(this.context, key);
    }
    /**
     * 异步写入 console 加密配置项（JSON）。
     */
    async setSecureSettingJson(key, value) {
        await setSecureSettingJson(this.context, key, value);
    }
    /**
     * 同步读取 agent 加密配置项（JSON）。
     */
    getAgentSecureSettingJsonSync(agentIdInput, keyInput) {
        return this.getSecureSettingJsonSync(buildAgentSecureSettingKey(agentIdInput, keyInput));
    }
    /**
     * 同步写入 agent 加密配置项（JSON）。
     */
    setAgentSecureSettingJsonSync(agentIdInput, keyInput, value) {
        this.setSecureSettingJsonSync(buildAgentSecureSettingKey(agentIdInput, keyInput), value);
    }
    /**
     * 删除 agent 加密配置项。
     */
    removeAgentSecureSetting(agentIdInput, keyInput) {
        this.removeSecureSetting(buildAgentSecureSettingKey(agentIdInput, keyInput));
    }
    /**
     * 异步读取 agent 加密配置项（JSON）。
     */
    async getAgentSecureSettingJson(agentIdInput, keyInput) {
        return await this.getSecureSettingJson(buildAgentSecureSettingKey(agentIdInput, keyInput));
    }
    /**
     * 异步写入 agent 加密配置项（JSON）。
     */
    async setAgentSecureSettingJson(agentIdInput, keyInput, value) {
        await this.setSecureSettingJson(buildAgentSecureSettingKey(agentIdInput, keyInput), value);
    }
    /**
     * 查询 env 条目（同步）。
     */
    listEnvEntriesSync() {
        return listEnvEntriesSync(this.context);
    }
    /**
     * 查询 env 条目（异步）。
     */
    async listEnvEntries() {
        return await listEnvEntries(this.context);
    }
    /**
     * 新增或更新 env 条目。
     */
    async upsertEnvEntry(input) {
        await upsertEnvEntry(this.context, input);
    }
    /**
     * 删除单个 env 条目。
     */
    removeEnvEntry(keyInput) {
        removeEnvEntry(this.context, keyInput);
    }
    /**
     * 列出全局环境变量（同步解密）。
     */
    listGlobalEnvEntriesSync() {
        return listGlobalEnvEntriesSync(this.context);
    }
    /**
     * 读取环境变量映射（同步解密）。
     */
    getEnvMapSync() {
        return getGlobalEnvMapSync(this.context);
    }
    /**
     * 列出环境变量（解密后）。
     */
    async listGlobalEnvEntries() {
        return await listGlobalEnvEntries(this.context);
    }
    /**
     * 读取环境变量映射（解密后）。
     */
    async getEnvMap() {
        return await getGlobalEnvMap(this.context);
    }
    /**
     * 新增或更新全局环境变量。
     */
    async upsertGlobalEnvEntry(input) {
        await upsertGlobalEnvEntry(this.context, input);
    }
    /**
     * 删除单个全局环境变量。
     */
    removeGlobalEnvEntry(keyInput) {
        removeGlobalEnvEntry(this.context, keyInput);
    }
    /**
     * 清空全局环境变量。
     */
    clearGlobalEnvEntries() {
        clearGlobalEnvEntries(this.context);
    }
    /**
     * 列出 channel accounts（同步解密）。
     */
    listChannelAccountsSync(channelInput) {
        return listChannelAccountsSync(this.context, channelInput);
    }
    /**
     * 按 ID 获取 channel account（同步解密）。
     */
    getChannelAccountSync(accountIdInput) {
        return getChannelAccountSync(this.context, accountIdInput);
    }
    /**
     * 列出 channel accounts（解密后）。
     */
    async listChannelAccounts(channelInput) {
        return await listChannelAccounts(this.context, channelInput);
    }
    /**
     * 按 ID 获取 channel account（解密后）。
     */
    async getChannelAccount(accountIdInput) {
        return await getChannelAccount(this.context, accountIdInput);
    }
    /**
     * 新增或更新 channel account。
     */
    async upsertChannelAccount(input) {
        await upsertChannelAccount(this.context, input);
    }
    /**
     * 删除 channel account。
     */
    removeChannelAccount(accountIdInput) {
        removeChannelAccount(this.context, accountIdInput);
    }
}
/**
 * 在 PlatformStore 上下文中执行操作。
 *
 * 关键点（中文）
 * - 用于一次性数据库操作，无需手动管理 PlatformStore 实例生命周期。
 * - 自动处理数据库连接和关闭。
 */
export function withPlatformStore(callback) {
    const dbPath = getPlatformStoreDbPath();
    fs.ensureDirSync(dbPath.replace(/\/[^/]+$/, ""));
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    const context = {
        sqlite,
        db: drizzle(sqlite),
    };
    ensurePlatformStoreSchema(context);
    try {
        return callback(context);
    }
    finally {
        sqlite.close();
    }
}
//# sourceMappingURL=index.js.map