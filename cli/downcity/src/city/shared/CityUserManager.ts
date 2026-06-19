/**
 * City 当前 CityPact user 管理器。
 *
 * 关键点（中文）
 * - 这是 City 访问 CityPact 用户态服务的唯一身份入口。
 * - env 覆盖优先级、`city city login` session 回退、token 实际 user 校验都集中在这里。
 * - 业务模块只消费解析后的身份，避免余额、Agent、模型目录各自拼接身份。
 */

import { CityPact } from "@downcity/city";
import {
  DEFAULT_FEDERATION_URL,
  DEFAULT_CITY_ID,
  normalizeCityUrl,
  readCityAdminSecretForUrl,
  readCurrentCitySession,
  readCitySessionForBase,
} from "./CityStateStore.js";
import type {
  ResolvedCityUser,
  ResolveCityUserInput,
  CityAccountsMeResult,
  CityUserEnvOverrides,
} from "../types/CityUser.js";

/**
 * City 当前 CityPact user 管理器。
 */
export class CityUserManager {
  /**
   * 解析当前有效 CityPact user。
   */
  async resolveCurrentUser(input: ResolveCityUserInput = {}): Promise<ResolvedCityUser> {
    const env = input.env ?? process.env;
    const allow_env_override = input.allow_env_override !== false;
    const require_user_token = input.require_user_token !== false;
    const verify_user = input.verify_user !== false;
    const env_federation_url = allow_env_override
      ? readFirstEnv(env, ["DOWNCITY_CITY_URL", "CITY_URL"])
      : "";
    const env_city_id = allow_env_override
      ? readFirstEnv(env, ["DOWNCITY_CITY_ID", "CITY_ID"])
      : "";
    const env_user_token = allow_env_override
      ? readFirstEnv(env, ["DOWNCITY_CITY_USER_TOKEN", "CITY_USER_TOKEN"])
      : "";
    const selected_session = readCurrentCitySession();
    const federation_url = normalizeCityUrl(env_federation_url || selected_session?.base_url || DEFAULT_FEDERATION_URL);
    const session = env_user_token
      ? selected_session
      : readCitySessionForBase(federation_url);

    const env_overrides: CityUserEnvOverrides = {
      federation_url: Boolean(env_federation_url),
      city_id: Boolean(env_city_id),
      user_token: Boolean(env_user_token),
    };
    const city_id = env_city_id || session?.city_id || DEFAULT_CITY_ID;
    const user_token = env_user_token || session?.user_token || "";
    const source = env_user_token ? "env" : "city-session";
    const warnings: string[] = [];

    if (!federation_url) {
      throw new Error("CityPact URL is required. Run `city city use` or set DOWNCITY_CITY_URL.");
    }
    if (require_user_token && !user_token) {
      throw new Error("CityPact user token is required. Run `city city login` first.");
    }
    if (env_user_token && selected_session?.user_id) {
      warnings.push("Env user token overrides the saved `city city login` session.");
    }
    if (env_federation_url && !env_user_token && !session?.user_token) {
      warnings.push("Env CityPact URL selected a base without a saved City user session.");
    }

    const resolved: ResolvedCityUser = {
      federation_url,
      city_id,
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
   * 创建当前有效 CityPact user client。
   */
  async createUserClient(input: ResolveCityUserInput = {}): Promise<{
    /**
     * 当前有效身份。
     */
    user: ResolvedCityUser;

    /**
     * CityPact user SDK client。
     */
    client: CityPact<"user">;
  }> {
    const user = await this.resolveCurrentUser({
      ...input,
      require_user_token: input.require_user_token !== false,
    });
    if (!user.user_token) {
      throw new Error("CityPact user token is required. Run `city city login` first.");
    }
    return {
      user,
      client: new CityPact({
        role: "user",
        federation_url: user.federation_url,
        city_id: user.city_id,
        user_token: user.user_token,
      }),
    };
  }

  /**
   * 读取当前 CityPact base 的 admin secret。
   */
  readAdminSecret(federation_url: string, env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string | undefined {
    return readFirstEnv(env, ["DOWNCITY_CITY_ADMIN_SECRET_KEY", "CITY_ADMIN_SECRET_KEY"])
      || readCityAdminSecretForUrl(federation_url)
      || undefined;
  }

  private async verifyCurrentUser(
    user: ResolvedCityUser,
    session_user_id?: string,
  ): Promise<ResolvedCityUser> {
    const client = new CityPact({
      role: "user",
      federation_url: user.federation_url,
      city_id: user.city_id,
      user_token: user.user_token,
    });
    const result = await client.service("accounts").get<CityAccountsMeResult>("me");
    const token_user_id = readString(result.user?.user_id);
    if (!token_user_id) {
      throw new Error("CityPact user token resolved without a user_id. Run `city city login` again.");
    }
    if (session_user_id && !user.env_overrides.user_token && session_user_id !== token_user_id) {
      throw new Error([
        "City CityPact session user does not match the authenticated token.",
        `session=${session_user_id}`,
        `token=${token_user_id}`,
        "Run `city city logout` and then `city city login`.",
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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = readString(env[key]);
    if (value) return value;
  }
  return "";
}
