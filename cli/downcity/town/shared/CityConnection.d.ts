/**
 * Town City user 连接管理服务。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `town` CLI 自己维护 user 登录态，避免把 user token 复制到 city 状态。
 * - Town 可以只读发现 `city` CLI 已配置的 base 地址，但不依赖 city 内部模块。
 * - CLI 命令装配统一放在 `src/command/CityCommand.ts`，本模块只保留状态与登录流程。
 */
import type { TownCityConnectionState } from "../types/TownCityConnection.js";
export declare const DEFAULT_CITY_URL = "https://base.downcity.ai";
export declare const DEFAULT_TOWN_ID = "town_downcity";
export declare function normalizeCityUrl(value: string): string;
export declare function readTownCityAdminSecretForBase(city_url: string): string | undefined;
export declare function readTownCityUserSessionForRuntime(): {
    city_url: string;
    town_id: string;
    user_token: string;
} | null;
export declare function readTownCityConnectionState(): TownCityConnectionState;
export declare function emitCityConnectionStatus(options?: {
    as_json?: boolean;
}): void;
export declare function emitCityServerList(options?: {
    as_json?: boolean;
}): void;
export declare function runCityConnectCommand(params: {
    url?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function runCityUseCommand(params: {
    server?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function runCityLoginCommand(params: {
    url?: string;
    town_id?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function runCityLogoutCommand(options?: {
    as_json?: boolean;
}): void;
export declare function runCityDisconnectCommand(options?: {
    as_json?: boolean;
}): void;
export declare function runInteractiveCityManager(): Promise<void>;
//# sourceMappingURL=CityConnection.d.ts.map