/**
 * PlatformStore 环境变量仓储。
 *
 * 关键点（中文）
 * - 统一管理 `env_entries` 单表。
 * - 当前版本只保留平台全局 env，不再区分 agent 私有层。
 */
import type { StoredEnvEntry, StoredGlobalEnvEntry, UpsertEnvEntryInput, UpsertGlobalEnvEntryInput } from "@downcity/agent";
import type { PlatformStoreContext } from "./StoreShared.js";
/**
 * 同步列出 env 条目。
 */
export declare function listEnvEntriesSync(context: PlatformStoreContext): StoredEnvEntry[];
/**
 * 异步列出 env 条目。
 */
export declare function listEnvEntries(context: PlatformStoreContext): Promise<StoredEnvEntry[]>;
/**
 * 新增或更新 env 条目。
 */
export declare function upsertEnvEntry(context: PlatformStoreContext, input: UpsertEnvEntryInput): Promise<void>;
/**
 * 删除单个 env 条目。
 */
export declare function removeEnvEntry(context: PlatformStoreContext, keyInput: string): void;
/**
 * 同步列出全局环境变量。
 */
export declare function listGlobalEnvEntriesSync(context: PlatformStoreContext): StoredGlobalEnvEntry[];
/**
 * 同步读取全局环境变量映射。
 */
export declare function getGlobalEnvMapSync(context: PlatformStoreContext): Record<string, string>;
/**
 * 异步列出全局环境变量。
 */
export declare function listGlobalEnvEntries(context: PlatformStoreContext): Promise<StoredGlobalEnvEntry[]>;
/**
 * 异步读取全局环境变量映射。
 */
export declare function getGlobalEnvMap(context: PlatformStoreContext): Promise<Record<string, string>>;
/**
 * 新增或更新全局环境变量。
 */
export declare function upsertGlobalEnvEntry(context: PlatformStoreContext, input: UpsertGlobalEnvEntryInput): Promise<void>;
/**
 * 删除单个全局环境变量。
 */
export declare function removeGlobalEnvEntry(context: PlatformStoreContext, keyInput: string): void;
/**
 * 清空全局环境变量。
 */
export declare function clearGlobalEnvEntries(context: PlatformStoreContext): void;
//# sourceMappingURL=StoreEnvRepository.d.ts.map