/**
 * Downcity 官方 Accounts 服务。
 *
 * 设计边界：
 * - better-auth 作为认证事实源，统一落到 `auth_users/auth_accounts/auth_sessions/auth_verifications`
 * - 服务自己只维护 `auth_profiles`
 * - OAuth 为兼容当前 CLI 轮询交互，保留自定义 callback 外壳
 */

import { InstallableService } from "@downcity/city";
import type { ServiceInstallContext } from "@downcity/city";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { readPreparedAll, readPreparedFirst, runPrepared } from "./db.js";
import {
  ACCOUNTS_OAUTH_STATE_TABLE,
  AUTH_ACCOUNT_TABLE,
  AUTH_SESSION_TABLE,
  AUTH_USER_TABLE,
  AUTH_VERIFICATION_TABLE,
  USER_PROFILE_TABLE,
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  accountsOAuthStates,
  userProfiles,
  type UserProfileRow,
} from "./schema.js";
import {
  OAUTH_PROVIDER_IDS,
  buildOAuthAuthorizeURL,
  buildSocialProviders,
  readOAuthProviderConfig,
  readOAuthProviderId,
  resolveOAuthProfile,
  type AccountsProviderItem,
  type OAuthProviderId,
  type OAuthProviderProfile,
} from "./oauth.js";

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Accounts 服务配置。
 */
export interface AccountsServiceOptions {
  /**
   * 登录、验证邮箱或 OAuth 完成后签发的 City user_token 有效期。
   */
  token_ttl?: string;

  /**
   * 自定义验证邮件发送函数。
   */
  sendEmail?: (params: { to: string; subject: string; text: string }) => Promise<void>;
}

/**
 * better-auth 用户表读取结果。
 */
interface AuthUserRow extends Record<string, unknown> {
  /**
   * `auth_users.id`。
   */
  id: string;

  /**
   * 主邮箱。
   */
  email: string;

  /**
   * 邮箱是否已验证。
   */
  emailVerified: number | boolean;

  /**
   * better-auth 原生展示名。
   */
  name: string;

  /**
   * better-auth 原生头像 URL。
   */
  image: string | null;

  /**
   * 创建时间。
   */
  createdAt: string;

  /**
   * 更新时间。
   */
  updatedAt: string;
}

/**
 * better-auth account 表读取结果。
 */
interface AuthAccountRow extends Record<string, unknown> {
  /**
   * `auth_accounts.id`。
   */
  id: string;

  /**
   * 绑定的 `auth_users.id`。
   */
  userId: string;
}

/**
 * OAuth state 记录。
 */
interface OAuthStateRow extends Record<string, unknown> {
  /**
   * OAuth state。
   */
  state: string;

  /**
   * 目标 town_id。
   */
  town_id: string;

  /**
   * provider 标识。
   */
  provider: string;

  /**
   * 完成后回填的 City user_token。
   */
  user_token: string;

  /**
   * 创建时间戳。
   */
  created_at: number;
}

export class AccountsService extends InstallableService {
  readonly id = "accounts";
  readonly name = "Accounts";
  readonly version = "0.4.0";
  readonly schema = {
    profile: userProfiles,
    oauth_states: accountsOAuthStates,
    auth_users: authUsers,
    auth_sessions: authSessions,
    auth_accounts: authAccounts,
    auth_verifications: authVerifications,
  };

  private auth!: ReturnType<typeof betterAuth>;

  constructor(private readonly options: AccountsServiceOptions = {}) {
    super([
      { key: "BETTER_AUTH_SECRET", description: "better-auth signing secret", required: true },
      { key: "GITHUB_CLIENT_ID", description: "GitHub OAuth App Client ID", required: false },
      { key: "GITHUB_CLIENT_SECRET", description: "GitHub OAuth App Client Secret", required: false },
      { key: "GOOGLE_CLIENT_ID", description: "Google OAuth Client ID", required: false },
      { key: "GOOGLE_CLIENT_SECRET", description: "Google OAuth Client Secret", required: false },
      { key: "WECHAT_CLIENT_ID", description: "WeChat Website App AppID", required: false },
      { key: "WECHAT_CLIENT_SECRET", description: "WeChat Website App AppSecret", required: false },
    ]);
    this.instruction = ({ actions }) => [
      "提供 Downcity 的账号、邮箱验证、GitHub/Google/WeChat OAuth 登录能力。",
      "注册或登录时传入 town_id 后，接口会返回绑定该 town 的 City user_token。",
      "OAuth 回调地址固定为 /v1/accounts/oauth/callback，服务会根据 City 公网地址生成完整回调 URL。",
      `当前暴露 ${actions.length} 个动作，常用流程是 register/login -> verify-email 或 oauth/start -> me。`,
    ].join("\n");
  }

  async _onInit(): Promise<void> {
    const sendEmail = this.options.sendEmail ?? defaultSendEmail;

    this.auth = betterAuth({
      secret: this._env?.get("BETTER_AUTH_SECRET"),
      database: drizzleAdapter(this.readDrizzleDb(), {
        provider: "sqlite",
        schema: {
          [AUTH_USER_TABLE]: authUsers,
          [AUTH_SESSION_TABLE]: authSessions,
          [AUTH_ACCOUNT_TABLE]: authAccounts,
          [AUTH_VERIFICATION_TABLE]: authVerifications,
        },
      }),
      baseURL: this._baseURL,
      user: {
        modelName: AUTH_USER_TABLE,
      },
      account: {
        modelName: AUTH_ACCOUNT_TABLE,
      },
      session: {
        modelName: AUTH_SESSION_TABLE,
      },
      verification: {
        modelName: AUTH_VERIFICATION_TABLE,
      },
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
      },
      emailVerification: {
        sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
          await sendEmail({
            to: user.email,
            subject: "Verify your email for Downcity",
            text: `Verification: ${url}`,
          });
        },
      },
      socialProviders: buildSocialProviders((key: string) => this._env?.get(key)),
    } as any);

    await super._onInit();
  }

  install(ctx: ServiceInstallContext): void {
    ctx.route({
      method: "POST",
      path: "/register",
      auth: [],
      handler: async (c) => {
        const body = await c.json<{ email?: string; password?: string; name?: string }>();
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");

        if (!email || !email.includes("@")) {
          return c.jsonResponse({ error: "valid email required" }, 400);
        }
        if (password.length < 8) {
          return c.jsonResponse({ error: "password must be at least 8 characters" }, 400);
        }

        try {
          const result = await this.auth.api.signUpEmail({
            body: { email, password, name: body.name ?? email.split("@")[0] ?? "" },
            asResponse: true,
          });

          if (!result.ok) {
            const err = await result.json().catch(() => ({})) as { message?: string };
            return c.jsonResponse({ error: err.message ?? "registration failed" }, result.status as number);
          }

          const data = await result.json() as { token?: string; user?: { id: string; email: string; name?: string; image?: string | null } };
          if (data.user?.id) {
            await this.upsertProfile({
              user_id: data.user.id,
              email: data.user.email,
              display_name: String(data.user.name ?? data.user.email.split("@")[0] ?? ""),
              avatar_url: String(data.user.image ?? ""),
            });
          }

          return c.jsonResponse({
            success: true,
            message: "verification email sent",
            verification_token: data.token,
            user_id: data.user?.id,
          });
        } catch (e) {
          return c.jsonResponse({ error: readErrorMessage(e) }, 500);
        }
      },
    });

    ctx.route({
      method: "POST",
      path: "/verify-email",
      auth: [],
      handler: async (c) => {
        const body = await c.json<{ token?: string; town_id?: string }>();
        const token = String(body.token ?? "").trim();
        if (!token) return c.jsonResponse({ error: "verification token required" }, 400);

        try {
          const result = await (this.auth.api as any).verifyEmail({
            body: { token },
            asResponse: true,
          });
          const data = await result.json() as { user?: { id: string; email: string; name?: string; image?: string | null } };
          const user_id = String(data.user?.id ?? "");

          if (user_id) {
            await this.upsertProfile({
              user_id,
              email: String(data.user?.email ?? ""),
              display_name: String(data.user?.name ?? data.user?.email?.split("@")[0] ?? ""),
              avatar_url: String(data.user?.image ?? ""),
            });
          }

          const userToken = await ctx.createUserToken({
            town_id: String(body.town_id ?? ""),
            user_id,
            ttl: this.options.token_ttl,
          });

          return c.jsonResponse({ user_token: userToken.user_token, user_id });
        } catch (e) {
          return c.jsonResponse({ error: readErrorMessage(e) }, 500);
        }
      },
    });

    ctx.route({
      method: "POST",
      path: "/login",
      auth: [],
      handler: async (c) => {
        const body = await c.json<{ email?: string; password?: string; town_id?: string }>();
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");

        if (!email || !password) {
          return c.jsonResponse({ error: "email and password required" }, 400);
        }

        try {
          const result = await this.auth.api.signInEmail({
            body: { email, password },
            asResponse: true,
          });

          if (!result.ok) {
            const err = await result.json().catch(() => ({})) as { message?: string };
            return c.jsonResponse({ error: err.message ?? "invalid email or password" }, 401);
          }

          const data = await result.json() as { user?: { id: string; email: string; name?: string; image?: string | null } };
          const user_id = String(data.user?.id ?? "");
          if (user_id) {
            await this.upsertProfile({
              user_id,
              email: String(data.user?.email ?? ""),
              display_name: String(data.user?.name ?? data.user?.email?.split("@")[0] ?? ""),
              avatar_url: String(data.user?.image ?? ""),
            });
          }

          const userToken = await ctx.createUserToken({
            town_id: String(body.town_id ?? ""),
            user_id,
            ttl: this.options.token_ttl,
          });

          return c.jsonResponse({
            user_token: userToken.user_token,
            user_id,
            email: data.user?.email,
          });
        } catch (e) {
          return c.jsonResponse({ error: readErrorMessage(e) }, 500);
        }
      },
    });

    ctx.route({
      method: "GET",
      path: "/providers",
      auth: [],
      handler: async (c) => c.jsonResponse({ items: this.listProviders() }),
    });

    ctx.route({
      method: "POST",
      path: "/oauth/start",
      auth: [],
      handler: async (c) => {
        const body = await c.json<{ provider?: string; town_id?: string }>();
        const provider = readOAuthProviderId(String(body.provider ?? "").trim());
        if (!provider) {
          return c.jsonResponse({ error: "provider must be github, google, or wechat" }, 400);
        }

        const config = this.getOAuthProviderConfig(provider);
        if (!config) {
          return c.jsonResponse({ error: "provider not configured" }, 400);
        }

        const town_id = String(body.town_id ?? "").trim() || "town_downcity";
        const state = randomToken(24);
        await this.createOAuthState(town_id, provider, state);
        const url = buildOAuthAuthorizeURL(config, this.getOAuthCallbackURL(), state);
        return c.jsonResponse({ url, state, provider });
      },
    });

    ctx.route({
      method: "GET",
      path: "/oauth/result",
      auth: [],
      handler: async (c) => {
        const state = String(new URL(c.request.url).searchParams.get("state") ?? "").trim();
        if (!state) return c.jsonResponse({ error: "state required" }, 400);

        const entry = await this.readOAuthState(state);
        if (!entry) return c.jsonResponse({ error: "state expired or invalid" }, 404);
        if (!entry.user_token) return c.jsonResponse({ status: "pending" });

        return c.jsonResponse({ status: "done", user_token: entry.user_token });
      },
    });

    ctx.route({
      method: "GET",
      path: "/me",
      auth: ["user"],
      handler: async (c) => {
        const user_id = String(c.user?.user_id ?? "");
        return c.jsonResponse({
          user: c.user,
          profile: user_id ? await this.readProfile(user_id) : null,
        });
      },
    });

    ctx.route({
      method: "POST",
      path: "/logout",
      auth: ["user"],
      handler: async (c) => c.jsonResponse({ success: true }),
    });

    ctx.route({
      method: "GET",
      path: "/users",
      auth: ["admin"],
      handler: async (c) => {
        try {
          return c.jsonResponse({ items: await this.listUsers() });
        } catch {
          return c.jsonResponse({ items: [] });
        }
      },
    });

    ctx.route({
      method: "GET",
      path: "/sessions",
      auth: ["admin"],
      handler: async (c) => {
        try {
          return c.jsonResponse({ items: await this.listSessions() });
        } catch {
          return c.jsonResponse({ items: [] });
        }
      },
    });
  }

  /**
   * 获取 better-auth 的 HTTP handler。
   */
  getAuthHandler() {
    return this.auth.handler;
  }

  /**
   * OAuth 回调处理。
   */
  async handleOAuthCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";

    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return new Response(OAUTH_ERROR_HTML.replace("{{ERROR}}", escapeHTML(desc)), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    try {
      if (!state || !code) throw new Error("Missing state or code");

      const entry = await this.readOAuthState(state);
      if (!entry) throw new Error("OAuth state expired or invalid");

      const provider = readOAuthProviderId(String(entry.provider));
      if (!provider) throw new Error("Invalid OAuth provider");

      const profile = await resolveOAuthProfile(
        provider,
        this.getOAuthProviderConfig(provider),
        code,
        this.getOAuthCallbackURL(),
      );
      const authUserId = await this.ensureOAuthAuthUser(profile, request);
      const result = await this._authenticator!.createToken({
        town_id: entry.town_id,
        user_id: authUserId,
        ttl: this.options.token_ttl,
      });
      await this.resolveOAuthState(state, result.user_token);
    } catch (e) {
      return new Response(OAUTH_ERROR_HTML.replace("{{ERROR}}", escapeHTML(readErrorMessage(e))), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response(OAUTH_SUCCESS_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  /**
   * 列出可用登录方式。
   */
  private listProviders(): AccountsProviderItem[] {
    return [
      {
        id: "email",
        type: "password",
        enabled: true,
        login_enabled: true,
        register_enabled: true,
      },
      ...OAUTH_PROVIDER_IDS.map((provider) => {
        const enabled = Boolean(this.getOAuthProviderConfig(provider));
        return enabled
          ? { id: provider, type: "oauth" as const, enabled: true }
          : { id: provider, type: "oauth" as const, enabled: false, reason: "not_configured" as const };
      }),
    ];
  }

  /**
   * 获取 provider 配置。
   */
  private getOAuthProviderConfig(provider: OAuthProviderId) {
    if (provider === "github") {
      return readOAuthProviderConfig(provider, this._env?.get("GITHUB_CLIENT_ID"), this._env?.get("GITHUB_CLIENT_SECRET"));
    }
    if (provider === "wechat") {
      return readOAuthProviderConfig(provider, this._env?.get("WECHAT_CLIENT_ID"), this._env?.get("WECHAT_CLIENT_SECRET"));
    }
    return readOAuthProviderConfig(provider, this._env?.get("GOOGLE_CLIENT_ID"), this._env?.get("GOOGLE_CLIENT_SECRET"));
  }

  /**
   * 当前请求环境下的 OAuth callback URL。
   */
  private getOAuthCallbackURL(): string {
    return `${this._baseURL}/v1/accounts/oauth/callback`;
  }

  /**
   * 确保 OAuth 用户落库到 better-auth 认证表，并同步 `auth_profiles`。
   */
  private async ensureOAuthAuthUser(profile: OAuthProviderProfile, request: Request): Promise<string> {
    const now = new Date().toISOString();
    const email = profile.email.trim().toLowerCase();

    const existingAccount = await readPreparedFirst(
      this.rawPrepare(`SELECT id, userId FROM ${AUTH_ACCOUNT_TABLE} WHERE providerId = ? AND accountId = ? LIMIT 1`),
      [profile.provider, profile.provider_user_id],
    ) as AuthAccountRow | null;

    let user = existingAccount
      ? await this.findAuthUserById(existingAccount.userId)
      : email
        ? await this.findAuthUserByEmail(email)
        : null;

    if (!user) {
      user = {
        id: prefixedId("usr"),
        email,
        emailVerified: profile.email_verified ? 1 : 0,
        name: profile.display_name,
        image: profile.avatar_url || null,
        createdAt: now,
        updatedAt: now,
      };
      await runPrepared(
        this.rawPrepare(`INSERT INTO ${AUTH_USER_TABLE} (id, email, emailVerified, name, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`),
        [user.id, user.email, normalizeBool(user.emailVerified), user.name, user.image, user.createdAt, user.updatedAt],
      );
    } else {
      user = {
        ...user,
        email,
        emailVerified: normalizeBool(user.emailVerified) || profile.email_verified ? 1 : 0,
        name: profile.display_name || user.name,
        image: profile.avatar_url || user.image,
        updatedAt: now,
      };
      await runPrepared(
        this.rawPrepare(`UPDATE ${AUTH_USER_TABLE} SET email = ?, emailVerified = ?, name = ?, image = ?, updatedAt = ? WHERE id = ?`),
        [user.email, normalizeBool(user.emailVerified), user.name, user.image, user.updatedAt, user.id],
      );
    }

    if (!existingAccount) {
      await runPrepared(
        this.rawPrepare(`INSERT INTO ${AUTH_ACCOUNT_TABLE} (id, accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
        [
          prefixedId("acc"),
          profile.provider_user_id,
          profile.provider,
          user.id,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          now,
          now,
        ],
      );
    } else {
      await runPrepared(
        this.rawPrepare(`UPDATE ${AUTH_ACCOUNT_TABLE} SET updatedAt = ? WHERE id = ?`),
        [now, existingAccount.id],
      );
    }

    await runPrepared(
      this.rawPrepare(`INSERT INTO ${AUTH_SESSION_TABLE} (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
      [
        prefixedId("sess"),
        new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString(),
        randomToken(32),
        now,
        now,
        String(request.headers.get("x-forwarded-for") ?? ""),
        String(request.headers.get("user-agent") ?? ""),
        user.id,
      ],
    );

    await this.upsertProfile({
      user_id: user.id,
      email,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    });

    return user.id;
  }

  /**
   * 创建 OAuth state。
   */
  private async createOAuthState(town_id: string, provider: OAuthProviderId, state: string): Promise<void> {
    await runPrepared(
      this.rawPrepare(`INSERT INTO ${ACCOUNTS_OAUTH_STATE_TABLE} (state, town_id, provider, user_token, created_at) VALUES (?, ?, ?, ?, ?)`),
      [state, town_id, provider, "", Date.now()],
    );
  }

  /**
   * 读取 OAuth state。
   */
  private async readOAuthState(state: string): Promise<OAuthStateRow | null> {
    const row = await readPreparedFirst(
      this.rawPrepare(`SELECT state, town_id, provider, user_token, created_at FROM ${ACCOUNTS_OAUTH_STATE_TABLE} WHERE state = ?`),
      [state],
    ) as OAuthStateRow | null;
    if (!row) return null;
    if (Date.now() - Number(row.created_at) > OAUTH_STATE_TTL_MS) {
      await runPrepared(this.rawPrepare(`DELETE FROM ${ACCOUNTS_OAUTH_STATE_TABLE} WHERE state = ?`), [state]);
      return null;
    }
    return row;
  }

  /**
   * 回填 OAuth state 的 City token。
   */
  private async resolveOAuthState(state: string, user_token: string): Promise<void> {
    await runPrepared(
      this.rawPrepare(`UPDATE ${ACCOUNTS_OAUTH_STATE_TABLE} SET user_token = ? WHERE state = ?`),
      [user_token, state],
    );
  }

  /**
   * 按 ID 读取认证用户。
   */
  private async findAuthUserById(user_id: string): Promise<AuthUserRow | null> {
    return await readPreparedFirst(
      this.rawPrepare(`SELECT id, email, emailVerified, name, image, createdAt, updatedAt FROM ${AUTH_USER_TABLE} WHERE id = ? LIMIT 1`),
      [user_id],
    ) as AuthUserRow | null;
  }

  /**
   * 按邮箱读取认证用户。
   */
  private async findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
    return await readPreparedFirst(
      this.rawPrepare(`SELECT id, email, emailVerified, name, image, createdAt, updatedAt FROM ${AUTH_USER_TABLE} WHERE lower(email) = ? LIMIT 1`),
      [email.toLowerCase()],
    ) as AuthUserRow | null;
  }

  /**
   * 读取一条 user profile。
   */
  private async readProfile(user_id: string): Promise<UserProfileRow | null> {
    return await readPreparedFirst(
      this.rawPrepare(`SELECT user_id, email, display_name, avatar_url, bio, created_at, updated_at FROM ${USER_PROFILE_TABLE} WHERE user_id = ? LIMIT 1`),
      [user_id],
    ) as UserProfileRow | null;
  }

  /**
   * upsert user profile。
   */
  private async upsertProfile(input: {
    user_id: string;
    email: string;
    display_name: string;
    avatar_url: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.readProfile(input.user_id);
    if (existing) {
      await runPrepared(
        this.rawPrepare(`UPDATE ${USER_PROFILE_TABLE} SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE user_id = ?`),
        [
          input.email || existing.email,
          input.display_name || existing.display_name,
          input.avatar_url || existing.avatar_url,
          now,
          input.user_id,
        ],
      );
      return;
    }

    await runPrepared(
      this.rawPrepare(`INSERT INTO ${USER_PROFILE_TABLE} (user_id, email, display_name, avatar_url, bio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      [input.user_id, input.email, input.display_name, input.avatar_url, "", now, now],
    );
  }

  /**
   * 管理侧用户列表。
   */
  private async listUsers(): Promise<Record<string, unknown>[]> {
    return await readPreparedAll(
      this.rawPrepare(
        `SELECT
          u.id as user_id,
          u.email as auth_email,
          u.emailVerified as email_verified,
          u.name as auth_name,
          u.image as auth_image,
          u.createdAt as auth_created_at,
          u.updatedAt as auth_updated_at,
          p.email as profile_email,
          p.display_name,
          p.avatar_url,
          p.bio,
          p.created_at as profile_created_at,
          p.updated_at as profile_updated_at
        FROM ${AUTH_USER_TABLE} u
        LEFT JOIN ${USER_PROFILE_TABLE} p ON p.user_id = u.id
        ORDER BY u.createdAt DESC`,
      ),
      [],
    );
  }

  /**
   * 管理侧 session 列表。
   */
  private async listSessions(): Promise<Record<string, unknown>[]> {
    const rows = await readPreparedAll(
      this.rawPrepare(`SELECT id as session_id, userId as user_id, expiresAt as expires_at, createdAt as created_at FROM ${AUTH_SESSION_TABLE} ORDER BY expiresAt DESC`),
      [],
    );
    return rows.map((row) => ({
      ...row,
      status: new Date(String(row.expires_at ?? "")).getTime() > Date.now() ? "active" : "expired",
    }));
  }

  /**
   * 创建原始 statement。
   */
  private rawPrepare(sql: string): any {
    return (this._raw as any).prepare(sql);
  }

  /**
   * 读取 City 注入的 Drizzle database。
   */
  private readDrizzleDb(): NonNullable<typeof this._db> {
    if (!this._db) {
      throw new Error("Accounts service database is not ready");
    }
    return this._db;
  }
}

/**
 * 创建 Accounts 服务实例。
 */
/**
 * 默认开发邮件发送器。
 */
async function defaultSendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  console.log("[accounts] VERIFICATION EMAIL");
  console.log(`  To: ${params.to}`);
  console.log(`  Subject: ${params.subject}`);
  console.log(`  Body: ${params.text}`);
}

/**
 * 生成带前缀的稳定 ID。
 */
function prefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * 生成 URL-safe token。
 */
function randomToken(size: number): string {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 归一化布尔值到 SQLite 整数。
 */
function normalizeBool(value: unknown): number {
  return value ? 1 : 0;
}

/**
 * 读取错误消息。
 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 转义 HTML。
 */
function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

// ===========================================================================
// OAuth 成功页面
// ===========================================================================

/**
 * OAuth 登录失败页面。
 */
const OAUTH_ERROR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login Failed — Downcity</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; justify-content: center; align-items: center;
         min-height: 100vh; margin: 0; background: #0a0a0a; color: #e0e0e0; }
  .box { text-align: center; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #ff7c7c; }
  p { color: #888; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="box">
  <h1>✗ Login Failed</h1>
  <p>Error: {{ERROR}}</p>
</div>
</body>
</html>`;

/**
 * OAuth 登录成功页面。
 */
const OAUTH_SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login Successful — Downcity</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; justify-content: center; align-items: center;
         min-height: 100vh; margin: 0; background: #0a0a0a; color: #e0e0e0; }
  .box { text-align: center; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #7cff7c; }
  p { color: #888; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="box">
  <h1>✓ Login Successful</h1>
  <p>You can close this window and return to the CLI.</p>
</div>
</body>
</html>`;
