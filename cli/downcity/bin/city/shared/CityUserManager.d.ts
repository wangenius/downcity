/**
 * City 当前 CityPact user 管理器。
 *
 * 关键点（中文）
 * - 这是 City 访问 CityPact 用户态服务的唯一身份入口。
 * - env 覆盖优先级、`city city login` session 回退、token 实际 user 校验都集中在这里。
 * - 业务模块只消费解析后的身份，避免余额、Agent、模型目录各自拼接身份。
 */
import { CityPact } from "@downcity/city";
import type { ResolvedCityUser, ResolveCityUserInput } from "../../city/types/CityUser.js";
/**
 * City 当前 CityPact user 管理器。
 */
export declare class CityUserManager {
    /**
     * 解析当前有效 CityPact user。
     */
    resolveCurrentUser(input?: ResolveCityUserInput): Promise<ResolvedCityUser>;
    /**
     * 创建当前有效 CityPact user client。
     */
    createUserClient(input?: ResolveCityUserInput): Promise<{
        /**
         * 当前有效身份。
         */
        user: ResolvedCityUser;
        /**
         * CityPact user SDK client。
         */
        client: CityPact<"user">;
    }>;
    /**
     * 读取当前 CityPact base 的 admin secret。
     */
    readAdminSecret(federation_url: string, env?: NodeJS.ProcessEnv | Record<string, string | undefined>): string | undefined;
    private verifyCurrentUser;
}
//# sourceMappingURL=CityUserManager.d.ts.map