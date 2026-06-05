/**
 * `town city` 命令与 City user 连接管理。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `town` CLI 自己维护 user 登录态，避免把 user token 复制到 city 状态。
 * - Town 可以只读发现 `city` CLI 已配置的 base 地址，但不依赖 city 内部模块。
 */
import type { Command } from "commander";
import type { TownCityConnectionState } from "@/types/TownCityConnection.js";
export declare const DEFAULT_CITY_URL = "https://base.downcity.ai";
export declare function normalizeCityUrl(value: string): string;
export declare function readTownCityAdminSecretForBase(city_url: string): string | undefined;
export declare function readTownCityUserSessionForRuntime(): {
    city_url: string;
    town_id: string;
    user_token: string;
} | null;
export declare function readTownCityConnectionState(): TownCityConnectionState;
export declare function runInteractiveCityManager(): Promise<void>;
export declare function registerCityConnectionCommand(program: Command): void;
//# sourceMappingURL=CityConnection.d.ts.map