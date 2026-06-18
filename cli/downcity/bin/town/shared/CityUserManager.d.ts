/**
 * Town 当前 City user 管理器。
 *
 * 关键点（中文）
 * - 这是 Town 访问 City 用户态服务的唯一身份入口。
 * - env 覆盖优先级、`town city login` session 回退、token 实际 user 校验都集中在这里。
 * - 业务模块只消费解析后的身份，避免余额、Agent、模型目录各自拼接身份。
 */
import { City } from "@downcity/city";
import type { ResolvedTownCityUser, ResolveTownCityUserInput } from "../types/TownCityUser.js";
/**
 * Town 当前 City user 管理器。
 */
export declare class CityUserManager {
    /**
     * 解析当前有效 City user。
     */
    resolveCurrentUser(input?: ResolveTownCityUserInput): Promise<ResolvedTownCityUser>;
    /**
     * 创建当前有效 City user client。
     */
    createUserClient(input?: ResolveTownCityUserInput): Promise<{
        /**
         * 当前有效身份。
         */
        user: ResolvedTownCityUser;
        /**
         * City user SDK client。
         */
        client: City<"user">;
    }>;
    /**
     * 读取当前 City base 的 admin secret。
     */
    readAdminSecret(city_url: string, env?: NodeJS.ProcessEnv | Record<string, string | undefined>): string | undefined;
    private verifyCurrentUser;
}
//# sourceMappingURL=CityUserManager.d.ts.map