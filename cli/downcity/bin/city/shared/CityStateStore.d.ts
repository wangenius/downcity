/**
 * City 本地状态存储。
 *
 * 关键点（中文）
 * - 只负责读取/写入 City 自己保存的 Federation 与 user session。
 * - 同时提供只读发现 `downfed` admin Federation 配置的能力。
 * - 不包含交互菜单、输出渲染或用户身份校验逻辑。
 * - 向后兼容旧状态字段 `base_url` / `selected_base_url`，迁移时自动改写为 federation_url。
 */
import type { FederationProfile } from "../../city/types/FederationMembership.js";
import type { CityUserSession } from "../../city/types/CitySession.js";
import type { CliLocale } from "../../shared/types/CliLocale.js";
import type { CityLocalState } from "../../city/types/CityState.js";
/** 默认 Federation 地址。 */
export declare const DEFAULT_FEDERATION_URL = "https://base.downcity.ai";
/** 默认 City 标识。 */
export declare const DEFAULT_CITY_ID = "city_downcity";
/**
 * 读取字符串字段。
 */
export declare function readCityString(value: unknown): string;
/**
 * 规范化 Federation URL。
 */
export declare function normalizeCityUrl(value: string): string;
/**
 * 读取 City 本地状态。
 */
export declare function readCityState(): CityLocalState;
/**
 * 写入 City 本地状态。
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
 * 读取当前选中的 Federation URL。
 */
export declare function resolve_selected_federation_url(state?: CityLocalState): string;
/**
 * 读取当前选中 Federation 的 user session。
 */
export declare function read_current_city_session(): CityUserSession | null;
/**
 * 读取指定 Federation 的 user session。
 */
export declare function read_city_session_for_federation(federation_url: string): CityUserSession | null;
/**
 * 添加或更新 City 本地 Federation 配置。
 */
export declare function upsert_federation_profile(state: CityLocalState, input: {
    /**
     * Federation URL。
     */
    federation_url: string;
    /**
     * 可选展示名。
     */
    name?: string;
}): CityLocalState;
/**
 * 列出 City 可选择的 Federation。
 */
export declare function list_federations(): FederationProfile[];
/**
 * 读取指定 Federation 的 admin secret。
 */
export declare function read_city_admin_secret_for_url(federation_url: string): string | undefined;
//# sourceMappingURL=CityStateStore.d.ts.map