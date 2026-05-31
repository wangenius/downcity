/**
 * PlatformStore 渠道账号仓储。
 *
 * 关键点（中文）
 * - 统一管理 `channel_accounts` 表。
 * - 负责敏感字段解密/加密与 channel account 的语义化组装。
 */
import type { StoredChannelAccount, UpsertChannelAccountInput } from "@downcity/agent";
import type { PlatformStoreContext } from "./StoreShared.js";
/**
 * 同步列出 channel accounts。
 */
export declare function listChannelAccountsSync(context: PlatformStoreContext, channelInput?: string): StoredChannelAccount[];
/**
 * 同步按 ID 获取 channel account。
 */
export declare function getChannelAccountSync(context: PlatformStoreContext, accountIdInput: string): StoredChannelAccount | null;
/**
 * 异步列出 channel accounts。
 */
export declare function listChannelAccounts(context: PlatformStoreContext, channelInput?: string): Promise<StoredChannelAccount[]>;
/**
 * 异步按 ID 获取 channel account。
 */
export declare function getChannelAccount(context: PlatformStoreContext, accountIdInput: string): Promise<StoredChannelAccount | null>;
/**
 * 新增或更新 channel account。
 */
export declare function upsertChannelAccount(context: PlatformStoreContext, input: UpsertChannelAccountInput): Promise<void>;
/**
 * 删除 channel account。
 */
export declare function removeChannelAccount(context: PlatformStoreContext, accountIdInput: string): void;
//# sourceMappingURL=StoreChannelAccountRepository.d.ts.map