/**
 * Town 当前 City user 管理器。
 *
 * 关键点（中文）
 * - 这是 Town 访问 City 用户态服务的唯一身份入口。
 * - env 覆盖优先级、`town city login` session 回退、token 实际 user 校验都集中在这里。
 * - 业务模块只消费解析后的身份，避免余额、Agent、模型目录各自拼接身份。
 */
import { City } from "@downcity/city";
import { DEFAULT_CITY_URL, DEFAULT_TOWN_ID, normalizeCityUrl, readCityAdminSecretForUrl, readCurrentTownCitySession, readTownCitySessionForBase, } from "./CityStateStore.js";
/**
 * Town 当前 City user 管理器。
 */
export class CityUserManager {
    /**
     * 解析当前有效 City user。
     */
    async resolveCurrentUser(input = {}) {
        const env = input.env ?? process.env;
        const allow_env_override = input.allow_env_override !== false;
        const require_user_token = input.require_user_token !== false;
        const verify_user = input.verify_user !== false;
        const env_city_url = allow_env_override
            ? readFirstEnv(env, ["DOWNCITY_CITY_URL", "CITY_URL"])
            : "";
        const env_town_id = allow_env_override
            ? readFirstEnv(env, ["DOWNCITY_CITY_TOWN_ID", "CITY_TOWN_ID"])
            : "";
        const env_user_token = allow_env_override
            ? readFirstEnv(env, ["DOWNCITY_CITY_USER_TOKEN", "CITY_USER_TOKEN"])
            : "";
        const selected_session = readCurrentTownCitySession();
        const city_url = normalizeCityUrl(env_city_url || selected_session?.base_url || DEFAULT_CITY_URL);
        const session = env_user_token
            ? selected_session
            : readTownCitySessionForBase(city_url);
        const env_overrides = {
            city_url: Boolean(env_city_url),
            town_id: Boolean(env_town_id),
            user_token: Boolean(env_user_token),
        };
        const town_id = env_town_id || session?.town_id || DEFAULT_TOWN_ID;
        const user_token = env_user_token || session?.user_token || "";
        const source = env_user_token ? "env" : "town-session";
        const warnings = [];
        if (!city_url) {
            throw new Error("City URL is required. Run `town city use` or set DOWNCITY_CITY_URL.");
        }
        if (require_user_token && !user_token) {
            throw new Error("City user token is required. Run `town city login` first.");
        }
        if (env_user_token && selected_session?.user_id) {
            warnings.push("Env user token overrides the saved `town city login` session.");
        }
        if (env_city_url && !env_user_token && !session?.user_token) {
            warnings.push("Env City URL selected a base without a saved Town user session.");
        }
        const resolved = {
            city_url,
            town_id,
            user_token,
            user_id: env_user_token ? undefined : session?.user_id,
            user_label: env_user_token ? undefined : session?.user_label,
            source,
            env_overrides,
            warnings,
        };
        if (verify_user && user_token) {
            return await this.verifyCurrentUser(resolved, env_user_token ? undefined : session?.user_id);
        }
        return resolved;
    }
    /**
     * 创建当前有效 City user client。
     */
    async createUserClient(input = {}) {
        const user = await this.resolveCurrentUser({
            ...input,
            require_user_token: input.require_user_token !== false,
        });
        if (!user.user_token) {
            throw new Error("City user token is required. Run `town city login` first.");
        }
        return {
            user,
            client: new City({
                role: "user",
                city_url: user.city_url,
                town_id: user.town_id,
                user_token: user.user_token,
            }),
        };
    }
    /**
     * 读取当前 City base 的 admin secret。
     */
    readAdminSecret(city_url, env = process.env) {
        return readFirstEnv(env, ["DOWNCITY_CITY_ADMIN_SECRET_KEY", "CITY_ADMIN_SECRET_KEY"])
            || readCityAdminSecretForUrl(city_url)
            || undefined;
    }
    async verifyCurrentUser(user, session_user_id) {
        const client = new City({
            role: "user",
            city_url: user.city_url,
            town_id: user.town_id,
            user_token: user.user_token,
        });
        const result = await client.service("accounts").get("me");
        const token_user_id = readString(result.user?.user_id);
        if (!token_user_id) {
            throw new Error("City user token resolved without a user_id. Run `town city login` again.");
        }
        if (session_user_id && !user.env_overrides.user_token && session_user_id !== token_user_id) {
            throw new Error([
                "Town City session user does not match the authenticated token.",
                `session=${session_user_id}`,
                `token=${token_user_id}`,
                "Run `town city logout` and then `town city login`.",
            ].join(" "));
        }
        const email = readString(result.profile?.email);
        const display_name = readString(result.profile?.display_name);
        return {
            ...user,
            user_id: token_user_id,
            user_label: email || display_name || token_user_id,
        };
    }
}
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function readFirstEnv(env, keys) {
    for (const key of keys) {
        const value = readString(env[key]);
        if (value)
            return value;
    }
    return "";
}
//# sourceMappingURL=CityUserManager.js.map