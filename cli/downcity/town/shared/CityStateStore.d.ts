/**
 * Town City 本地状态存储。
 *
 * 关键点（中文）
 * - 只负责读取/写入 Town 自己保存的 City base 与 user session。
 * - 同时提供只读发现 `city` CLI admin base 配置的能力。
 * - 不包含交互菜单、输出渲染或用户身份校验逻辑。
 */
import type { TownCityServerProfile } from "../types/TownCityConnection.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import type { TownCityLocalState } from "../types/TownCityState.js";
export declare const DEFAULT_CITY_URL = "https://base.downcity.ai";
export declare const DEFAULT_TOWN_ID = "town_downcity";
/**
 * 读取字符串字段。
 */
export declare function readCityString(value: unknown): string;
/**
 * 规范化 City base URL。
 */
export declare function normalizeCityUrl(value: string): string;
/**
 * 读取 Town City 本地状态。
 */
export declare function readTownCityState(): TownCityLocalState;
/**
 * 写入 Town City 本地状态。
 */
export declare function writeTownCityState(state: TownCityLocalState): void;
/**
 * 读取当前选中的 City base URL。
 */
export declare function resolveSelectedBaseUrl(state?: TownCityLocalState): string;
/**
 * 读取当前选中 base 的 user session。
 */
export declare function readCurrentTownCitySession(): TownCityUserSession | null;
/**
 * 读取指定 City base 的 user session。
 */
export declare function readTownCitySessionForBase(city_url: string): TownCityUserSession | null;
/**
 * 添加或更新 Town 本地 City base。
 */
export declare function upsertTownProfile(state: TownCityLocalState, input: {
    /**
     * City base URL。
     */
    base_url: string;
    /**
     * 可选展示名。
     */
    name?: string;
}): TownCityLocalState;
/**
 * 列出 Town 可选择的 City base。
 */
export declare function listTownCityServers(): TownCityServerProfile[];
/**
 * 读取指定 City base 的 admin secret。
 */
export declare function readCityAdminSecretForUrl(city_url: string): string | undefined;
//# sourceMappingURL=CityStateStore.d.ts.map