/**
 * PlatformStore 门面。
 *
 * 关键点（中文）
 * - 对外仍然只暴露一个 `PlatformStore` 类，保持调用入口稳定。
 * - 内部已经按职责拆成 schema、secure settings、env、chat accounts 多个模块。
 * - 这样既能保持外部 API 简洁，也能把通用存储层控制在可维护的模块粒度内。
 */
import type { PlatformStoreContext } from "./StoreShared.js";
import type { StoredChannelAccount, StoredEnvEntry, StoredGlobalEnvEntry, UpsertChannelAccountInput, UpsertEnvEntryInput, UpsertGlobalEnvEntryInput } from "@downcity/agent";
/**
 * 平台控制面全局存储门面。
 */
export declare class PlatformStore {
    private readonly sqlite;
    constructor(dbPath?: string);
    /**
     * 暴露给内部 helper 的只读上下文视图。
     */
    private get context();
    /**
     * 关闭连接。
     */
    close(): void;
    /**
     * 清空所有存储数据。
     */
    clearAll(): void;
    /**
     * 同步读取 console 加密配置项（JSON）。
     */
    getSecureSettingJsonSync<T>(key: string): T | null;
    /**
     * 同步写入 console 加密配置项（JSON）。
     */
    setSecureSettingJsonSync(key: string, value: unknown): void;
    /**
     * 删除 console 加密配置项。
     */
    removeSecureSetting(key: string): void;
    /**
     * 异步读取 console 加密配置项（JSON）。
     */
    getSecureSettingJson<T>(key: string): Promise<T | null>;
    /**
     * 异步写入 console 加密配置项（JSON）。
     */
    setSecureSettingJson(key: string, value: unknown): Promise<void>;
    /**
     * 同步读取 agent 加密配置项（JSON）。
     */
    getAgentSecureSettingJsonSync<T>(agentIdInput: string, keyInput: string): T | null;
    /**
     * 同步写入 agent 加密配置项（JSON）。
     */
    setAgentSecureSettingJsonSync(agentIdInput: string, keyInput: string, value: unknown): void;
    /**
     * 删除 agent 加密配置项。
     */
    removeAgentSecureSetting(agentIdInput: string, keyInput: string): void;
    /**
     * 异步读取 agent 加密配置项（JSON）。
     */
    getAgentSecureSettingJson<T>(agentIdInput: string, keyInput: string): Promise<T | null>;
    /**
     * 异步写入 agent 加密配置项（JSON）。
     */
    setAgentSecureSettingJson(agentIdInput: string, keyInput: string, value: unknown): Promise<void>;
    /**
     * 查询 env 条目（同步）。
     */
    listEnvEntriesSync(): StoredEnvEntry[];
    /**
     * 查询 env 条目（异步）。
     */
    listEnvEntries(): Promise<StoredEnvEntry[]>;
    /**
     * 新增或更新 env 条目。
     */
    upsertEnvEntry(input: UpsertEnvEntryInput): Promise<void>;
    /**
     * 删除单个 env 条目。
     */
    removeEnvEntry(keyInput: string): void;
    /**
     * 列出全局环境变量（同步解密）。
     */
    listGlobalEnvEntriesSync(): StoredGlobalEnvEntry[];
    /**
     * 读取环境变量映射（同步解密）。
     */
    getEnvMapSync(): Record<string, string>;
    /**
     * 列出环境变量（解密后）。
     */
    listGlobalEnvEntries(): Promise<StoredGlobalEnvEntry[]>;
    /**
     * 读取环境变量映射（解密后）。
     */
    getEnvMap(): Promise<Record<string, string>>;
    /**
     * 新增或更新全局环境变量。
     */
    upsertGlobalEnvEntry(input: UpsertGlobalEnvEntryInput): Promise<void>;
    /**
     * 删除单个全局环境变量。
     */
    removeGlobalEnvEntry(keyInput: string): void;
    /**
     * 清空全局环境变量。
     */
    clearGlobalEnvEntries(): void;
    /**
     * 列出 chat accounts（同步解密）。
     */
    listChannelAccountsSync(channelInput?: string): StoredChannelAccount[];
    /**
     * 按 ID 获取 chat account（同步解密）。
     */
    getChannelAccountSync(accountIdInput: string): StoredChannelAccount | null;
    /**
     * 列出 chat accounts（解密后）。
     */
    listChannelAccounts(channelInput?: string): Promise<StoredChannelAccount[]>;
    /**
     * 按 ID 获取 chat account（解密后）。
     */
    getChannelAccount(accountIdInput: string): Promise<StoredChannelAccount | null>;
    /**
     * 新增或更新 chat account。
     */
    upsertChannelAccount(input: UpsertChannelAccountInput): Promise<void>;
    /**
     * 删除 chat account。
     */
    removeChannelAccount(accountIdInput: string): void;
}
/**
 * 在 PlatformStore 上下文中执行操作。
 *
 * 关键点（中文）
 * - 用于一次性数据库操作，无需手动管理 PlatformStore 实例生命周期。
 * - 自动处理数据库连接和关闭。
 */
export declare function withPlatformStore<T>(callback: (context: PlatformStoreContext) => T): T;
//# sourceMappingURL=index.d.ts.map