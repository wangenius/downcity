/**
 * Town City user 登录流程。
 *
 * 关键点（中文）
 * - 只负责通过 City user auth providers 获取 user_token。
 * - 不读写 Town 本地状态，调用方负责持久化 session。
 */
import type { TownCityLoginInput, TownCityUserSession } from "@/types/TownCitySession.js";
/**
 * 执行 Town City user 登录。
 */
export declare function performTownCityUserLogin(input: TownCityLoginInput): Promise<TownCityUserSession | null>;
//# sourceMappingURL=CityUserLogin.d.ts.map