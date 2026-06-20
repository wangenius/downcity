/**
 * PlatformStore 加密配置仓储。
 *
 * 关键点（中文）
 * - 管理 `platform_secure_settings` 表。
 * - 平台级与 agent 级敏感配置都复用这套存储。
 */
import type { PlatformStoreContext } from "../../../city/runtime/store/StoreShared.js";
/**
 * 同步读取加密 JSON 配置。
 */
export declare function getSecureSettingJsonSync<T>(context: PlatformStoreContext, key: string): T | null;
/**
 * 同步写入加密 JSON 配置。
 */
export declare function setSecureSettingJsonSync(context: PlatformStoreContext, key: string, value: unknown): void;
/**
 * 删除加密配置。
 */
export declare function removeSecureSetting(context: PlatformStoreContext, key: string): void;
/**
 * 异步读取加密 JSON 配置。
 */
export declare function getSecureSettingJson<T>(context: PlatformStoreContext, key: string): Promise<T | null>;
/**
 * 异步写入加密 JSON 配置。
 */
export declare function setSecureSettingJson(context: PlatformStoreContext, key: string, value: unknown): Promise<void>;
/**
 * 构造 agent 级加密配置 key。
 */
export declare function buildAgentSecureSettingKey(agentIdInput: string, keyInput: string): string;
//# sourceMappingURL=StoreSecureSettings.d.ts.map