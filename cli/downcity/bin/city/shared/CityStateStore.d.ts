/**
 * City City 本地状态存储。
 *
 * 关键点（中文）
 * - 只负责读取/写入 City 自己保存的 City base 与 user session。
 * - 同时提供只读发现 `city` CLI admin base 配置的能力。
 * - 不包含交互菜单、输出渲染或用户身份校验逻辑。
 */
import type { CityServerProfile } from "../types/CityConnection.js";
import type { CityUserSession } from "../types/CitySession.js";
import type { CliLocale } from "../../types/CliLocale.js";
import type { CityLocalState } from "../types/CityState.js";
export declare const DEFAULT_FEDERATION_URL = "https://base.downcity.ai";
export declare const DEFAULT_CITY_ID = "city_downcity";
/**
 * 读取字符串字段。
 */
export declare function readCityString(value: unknown): string;
/**
 * 规范化 City base URL。
 */
export declare function normalizeCityUrl(value: string): string;
/**
 * 读取 City City 本地状态。
 */
export declare function readCityState(): CityLocalState;
/**
 * 写入 City City 本地状态。
 */
export declare function writeCityState(state: CityLocalState): void;
/**
 * 读取 City 持久化的 CLI 语言。
 */
export declare function readPersistedCityCliLocale(): CliLocale | undefined;
/**
 * 写入 City 持久化的 CLI 语言。
 */
export declare function writePersistedCityCliLocale(cli_locale: CliLocale): void;
/**
 * 读取当前选中的 City base URL。
 */
export declare function resolveSelectedBaseUrl(state?: CityLocalState): string;
/**
 * 读取当前选中 base 的 user session。
 */
export declare function readCurrentCitySession(): CityUserSession | null;
/**
 * 读取指定 City base 的 user session。
 */
export declare function readCitySessionForBase(federation_url: string): CityUserSession | null;
/**
 * 添加或更新 City 本地 City base。
 */
export declare function upsertCityProfile(state: CityLocalState, input: {
    /**
     * City base URL。
     */
    base_url: string;
    /**
     * 可选展示名。
     */
    name?: string;
}): CityLocalState;
/**
 * 列出 City 可选择的 City base。
 */
export declare function listCityServers(): CityServerProfile[];
/**
 * 读取指定 City base 的 admin secret。
 */
export declare function readCityAdminSecretForUrl(federation_url: string): string | undefined;
//# sourceMappingURL=CityStateStore.d.ts.map