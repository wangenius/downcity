/**
 * Town CityPact user 登录流程。
 *
 * 关键点（中文）
 * - 只负责通过 CityPact user auth providers 获取 user_token。
 * - 不读写 Town 本地状态，调用方负责持久化 session。
 */
import type { TownCityLoginInput, TownCityUserSession } from "../types/TownCitySession.js";
interface town_city_user_login_options {
    /** 是否禁止向命令行直接输出提示块。 */
    silent?: boolean;
}
/**
 * 执行 Town CityPact user 登录。
 */
export declare function performTownCityUserLogin(input: TownCityLoginInput, options?: town_city_user_login_options): Promise<TownCityUserSession | null>;
export {};
//# sourceMappingURL=CityUserLogin.d.ts.map