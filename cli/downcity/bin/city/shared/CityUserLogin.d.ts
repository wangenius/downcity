/**
 * City user 登录流程。
 *
 * 关键点（中文）
 * - 只负责通过 City user auth providers 获取 user_token。
 * - 不读写 City 本地状态，调用方负责持久化 session。
 */
import type { CityLoginInput, CityUserSession } from "../../city/types/CitySession.js";
interface city_user_login_options {
    /** 是否禁止向命令行直接输出提示块。 */
    silent?: boolean;
}
/**
 * 执行 City user 登录。
 */
export declare function performCityUserLogin(input: CityLoginInput, options?: city_user_login_options): Promise<CityUserSession | null>;
export {};
//# sourceMappingURL=CityUserLogin.d.ts.map