/**
 * User 鉴权模块。
 *
 * 登录方式不在 CLI 里写死，而是先读取 City 返回的 providers：
 *   1. Email Login      — 邮箱 + 密码直接登录
 *   2. Email Register   — 邮箱 + 密码注册 → 验证码 → 完成
 *   3. 任意 OAuth Provider — 浏览器授权（完全以服务端 providers 返回为准）
 *
 * 已有有效 session 直接返回，不重复鉴权。
 */

import { City } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { normalizeBaseUrl } from "../core/env.js";
import { openBrowser } from "../core/browser.js";
import { readUserSession, writeUserSession, readConfig, type UserSession } from "../core/session.js";
import { askText, askSecret, showError, showSuccess, show } from "../core/ui.js";

export interface UserContext {
  session: UserSession;
  config: { model: string };
}

type AuthMethod = "login" | "register" | `oauth:${string}`;

/**
 * 服务端返回的单个登录方式描述。
 */
interface AccountsProviderItem {
  /**
   * 登录方式标识。
   */
  id?: string;

  /**
   * 登录方式类别。
   */
  type?: string;

  /**
   * 当前 City 是否真的启用了该登录方式。
   */
  enabled?: boolean;

  /**
   * 邮箱登录是否开放。
   */
  login_enabled?: boolean;

  /**
   * 邮箱注册是否开放。
   */
  register_enabled?: boolean;

  /**
   * 当登录方式不可用时的原因码。
   */
  reason?: string;
}

/**
 * 登录菜单项。
 */
interface AuthOption {
  /**
   * 菜单展示文案。
   */
  label: string;

  /**
   * 选择后进入的鉴权方式。
   */
  value: AuthMethod;

  /**
   * 菜单辅助提示。
   */
  hint: string;
}

// ===========================================================================
// 入口
// ===========================================================================

export async function userAuth(baseUrl: string): Promise<UserContext | undefined> {
  const existing = readUserSession(normalizeBaseUrl(baseUrl));
  if (existing) return { session: existing, config: readConfig() };

  while (true) {
    const method = await selectAuthMethod(baseUrl);
    if (!method) return undefined;

    const ctx = await doAuth(baseUrl, method);
    if (ctx) return ctx;
  }
}

async function selectAuthMethod(baseUrl: string): Promise<AuthMethod | undefined> {
  const options = await loadAuthOptions(baseUrl);
  if (options.length === 0) {
    showError("No sign-in methods enabled on server.");
    return undefined;
  }

  const selected = await select({
    message: "Sign in",
    options,
  });
  if (!selected || isCancel(selected)) return undefined;
  return selected as AuthMethod;
}

async function loadAuthOptions(baseUrl: string): Promise<AuthOption[]> {
  const client = new City({ role: "user", city_url: normalizeBaseUrl(baseUrl) });
  const accounts = client.service("accounts");

  try {
    const result = await accounts.get<{ items?: AccountsProviderItem[] }>("providers");
    return mapProvidersToOptions(result.items ?? []);
  } catch (e) {
    showError(`Failed to load sign-in methods: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

function mapProvidersToOptions(items: AccountsProviderItem[]): AuthOption[] {
  const options: AuthOption[] = [];

  for (const item of items) {
    if (!item.enabled) continue;

    if (item.id === "email" && item.type === "password") {
      if (item.login_enabled !== false) {
        options.push({ label: "Email Login", value: "login", hint: "Sign in with email + password" });
      }
      if (item.register_enabled !== false) {
        options.push({ label: "Email Register", value: "register", hint: "Create a new account" });
      }
      continue;
    }

    if (item.type === "oauth" && typeof item.id === "string" && item.id.trim()) {
      const provider = item.id.trim();
      options.push({
        label: formatOAuthProviderLabel(provider),
        value: `oauth:${provider}`,
        hint: `Sign in with ${formatOAuthProviderLabel(provider)} OAuth`,
      });
    }
  }

  return options;
}

// ===========================================================================
// 鉴权分发
// ===========================================================================

async function doAuth(baseUrl: string, method: AuthMethod): Promise<UserContext | undefined> {
  if (method.startsWith("oauth:")) {
    return oauthAuth(baseUrl, method.slice("oauth:".length));
  }

  switch (method) {
    case "login":    return emailLogin(baseUrl);
    case "register": return emailRegister(baseUrl);
  }
}

// ===========================================================================
// 邮箱登录
// ===========================================================================

interface LoginResult {
  user_token?: string;
  user_id?: string;
  email?: string;
  error?: string;
}

async function emailLogin(baseUrl: string): Promise<UserContext | undefined> {
  const email = await askText("email");
  if (!email || !email.includes("@")) { showError("invalid email"); return undefined; }

  const password = await askSecret("password");
  if (!password) return undefined;

  const client = new City({ role: "user", city_url: normalizeBaseUrl(baseUrl) });
  const accounts = client.service("accounts");

  try {
    const result = await accounts.action("login").invoke<LoginResult>({ email, password });
    if (result.error) { showError(result.error); return undefined; }
    if (!result.user_token) { showError("login failed: no token"); return undefined; }

    return saveSession(baseUrl, email, result as { user_token: string; user_id?: string });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

// ===========================================================================
// 邮箱注册 + 验证
// ===========================================================================

interface RegisterResult {
  success?: boolean;
  message?: string;
  verification_token?: string;
  user_id?: string;
  error?: string;
}

interface VerifyResult {
  user_token?: string;
  user_id?: string;
  error?: string;
}

async function emailRegister(baseUrl: string): Promise<UserContext | undefined> {
  const email = await askText("email");
  if (!email || !email.includes("@")) { showError("invalid email"); return undefined; }

  const password = await askSecret("password (min 8 characters)");
  if (!password || password.length < 8) { showError("password must be at least 8 characters"); return undefined; }

  const client = new City({ role: "user", city_url: normalizeBaseUrl(baseUrl) });
  const accounts = client.service("accounts");

  let reg: RegisterResult;
  try {
    reg = await accounts.action("register").invoke<RegisterResult>({ email, password });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return undefined;
  }

  if (reg.error) { showError(reg.error); return undefined; }
  if (!reg.success) { showError("registration failed"); return undefined; }

  showSuccess("Verification code sent to your email");
  show("If email delivery is unavailable, check server logs for the verification code.");

  const token = await askText("verification token");
  if (!token) return undefined;

  try {
    const verify = await accounts.action("verify-email").invoke<VerifyResult>({ token: token.trim() });
    if (verify.error) { showError(verify.error); return undefined; }
    if (!verify.user_token) { showError("verification failed: no token"); return undefined; }

    return saveSession(baseUrl, email, verify as { user_token: string; user_id?: string });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

// ===========================================================================
// OAuth 登录 (GitHub / Google)
// ===========================================================================

interface OAuthStartResult {
  url?: string;
  state?: string;
  error?: string;
}

interface OAuthPollResult {
  status?: string;
  user_token?: string;
  error?: string;
}

async function oauthAuth(baseUrl: string, provider: string): Promise<UserContext | undefined> {
  const client = new City({ role: "user", city_url: normalizeBaseUrl(baseUrl) });
  const accounts = client.service("accounts");

  let start: OAuthStartResult;
  try {
    start = await accounts.action("oauth/start").invoke<OAuthStartResult>({ provider });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return undefined;
  }

  if (start.error) { showError(start.error); return undefined; }
  if (!start.url || !start.state) { showError("failed to start OAuth"); return undefined; }

  show(`Opening browser for ${provider} authorization...`);
  const opened = openBrowser(start.url);
  if (!opened) showError(`Could not open browser. Please visit:\n  ${start.url}`);

  show("Waiting for authorization...");
  const result = await pollOAuth(client, start.state);

  if (!result || result.error) { showError(result?.error ?? "OAuth failed"); return undefined; }
  if (!result.user_token) { showError("OAuth failed: no token"); return undefined; }

  showSuccess(`${provider} login successful`);
  return saveSession(baseUrl, `${provider}:`, result as { user_token: string; user_id?: string });
}

/** 轮询 OAuth 结果（最多 3 分钟） */
async function pollOAuth(client: City, state: string): Promise<OAuthPollResult | undefined> {
  const accounts = client.service("accounts");
  for (let i = 0; i < 180; i++) {
    try {
      const result = await accounts.get<OAuthPollResult>("oauth/result", { state });
      if (result.error) return result;
      if (result.status === "done") return result;
    } catch { /* continue polling */ }
    await sleep(1000);
  }
  return { error: "OAuth timed out" };
}

// ===========================================================================
// 工具函数
// ===========================================================================

function saveSession(baseUrl: string, email: string, result: { user_token: string; user_id?: string }): UserContext {
  const session: UserSession = {
    base_url: normalizeBaseUrl(baseUrl),
    email,
    user_id: result.user_id ?? "",
    town_id: "town_downcity",
    user_token: result.user_token,
  };
  writeUserSession(session);
  showSuccess(`signed in: ${email}`);
  return { session, config: readConfig() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatOAuthProviderLabel(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return "OAuth";
  if (normalized === "github") return "GitHub";
  if (normalized === "google") return "Google";
  if (normalized === "wechat") return "WeChat";
  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
