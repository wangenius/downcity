/**
 * Town City user 登录流程。
 *
 * 关键点（中文）
 * - 只负责通过 City user auth providers 获取 user_token。
 * - 不读写 Town 本地状态，调用方负责持久化 session。
 */
import { spawnSync } from "node:child_process";
import prompts from "prompts";
import { City } from "@downcity/city";
import { emitCliBlock } from "./CliReporter.js";
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function mapProvidersToOptions(items) {
    const options = [];
    for (const item of items) {
        if (!item.enabled)
            continue;
        if (item.id === "email" && item.type === "password") {
            if (item.login_enabled !== false) {
                options.push({
                    title: "Email Login",
                    value: "login",
                    description: "Sign in with email + password",
                });
            }
            if (item.register_enabled !== false) {
                options.push({
                    title: "Email Register",
                    value: "register",
                    description: "Create a new user account",
                });
            }
            continue;
        }
        if (item.type === "oauth" && typeof item.id === "string" && item.id.trim()) {
            const provider = item.id.trim();
            options.push({
                title: formatOAuthProviderLabel(provider),
                value: `oauth:${provider}`,
                description: `Sign in with ${formatOAuthProviderLabel(provider)} OAuth`,
            });
        }
    }
    return options;
}
async function loadAuthOptions(city_url) {
    const client = new City({ role: "user", city_url });
    const accounts = client.service("accounts");
    const result = await accounts.get("providers");
    return mapProvidersToOptions(result.items ?? []);
}
async function promptAuthMethod(city_url) {
    const options = await loadAuthOptions(city_url);
    if (options.length === 0) {
        emitCliBlock({
            tone: "warning",
            title: "No sign-in methods",
            note: "This City base has no enabled user auth providers.",
        });
        return null;
    }
    const response = (await prompts({
        type: "select",
        name: "method",
        message: "Sign in",
        choices: options.map((item) => ({
            title: item.title,
            description: item.description,
            value: item.value,
        })),
    }));
    return response.method ?? null;
}
async function emailLogin(input) {
    const response = (await prompts([
        {
            type: "text",
            name: "email",
            message: "email",
        },
        {
            type: "password",
            name: "password",
            message: "password",
        },
    ]));
    const email = readString(response.email);
    const password = String(response.password || "");
    if (!email || !email.includes("@") || !password)
        return null;
    const client = new City({ role: "user", city_url: input.city_url });
    const result = await client.service("accounts").action("login").invoke({
        email,
        password,
        town_id: input.town_id,
    });
    if (result.error || !result.user_token) {
        throw new Error(result.error || "login failed: no token");
    }
    return await buildVerifiedUserSession({
        ...input,
        user_token: result.user_token,
        user_id: result.user_id,
        user_label: result.email || email,
    });
}
async function emailRegister(input) {
    const response = (await prompts([
        {
            type: "text",
            name: "email",
            message: "email",
        },
        {
            type: "password",
            name: "password",
            message: "password (min 8 characters)",
        },
    ]));
    const email = readString(response.email);
    const password = String(response.password || "");
    if (!email || !email.includes("@"))
        throw new Error("invalid email");
    if (password.length < 8)
        throw new Error("password must be at least 8 characters");
    const client = new City({ role: "user", city_url: input.city_url });
    const accounts = client.service("accounts");
    const registered = await accounts.action("register").invoke({
        email,
        password,
    });
    if (registered.error || !registered.success) {
        throw new Error(registered.error || "registration failed");
    }
    emitCliBlock({
        tone: "success",
        title: "Verification code sent",
        note: "If email delivery is unavailable, check server logs for the verification code.",
    });
    const verify_response = (await prompts({
        type: "text",
        name: "verification_token",
        message: "verification token",
    }));
    const verification_token = readString(verify_response.verification_token);
    if (!verification_token)
        return null;
    const verified = await accounts.action("verify-email").invoke({
        token: verification_token,
        town_id: input.town_id,
    });
    if (verified.error || !verified.user_token) {
        throw new Error(verified.error || "verification failed: no token");
    }
    return await buildVerifiedUserSession({
        ...input,
        user_token: verified.user_token,
        user_id: verified.user_id || registered.user_id,
        user_label: email,
    });
}
async function oauthAuth(input, provider) {
    const client = new City({ role: "user", city_url: input.city_url });
    const accounts = client.service("accounts");
    const started = await accounts.action("oauth/start").invoke({
        provider,
        town_id: input.town_id,
    });
    if (started.error || !started.url || !started.state) {
        throw new Error(started.error || "failed to start OAuth");
    }
    const opened = openBrowser(started.url);
    emitCliBlock({
        tone: opened ? "info" : "warning",
        title: `OAuth: ${formatOAuthProviderLabel(provider)}`,
        note: opened ? "Waiting for browser authorization..." : started.url,
    });
    const result = await pollOAuth(client, started.state);
    if (!result || result.error || !result.user_token) {
        throw new Error(result?.error || "OAuth failed");
    }
    return await buildVerifiedUserSession({
        ...input,
        user_token: result.user_token,
        user_id: result.user_id,
        user_label: result.email || `${provider}:${result.user_id || ""}`,
    });
}
async function pollOAuth(client, state) {
    const accounts = client.service("accounts");
    for (let index = 0; index < 180; index += 1) {
        try {
            const result = await accounts.get("oauth/result", { state });
            if (result.error)
                return result;
            if (result.status === "done")
                return result;
        }
        catch {
            // 关键点（中文）：OAuth result 短暂不可达时继续轮询，避免网络抖动直接中断登录。
        }
        await sleep(1000);
    }
    return { error: "OAuth timed out" };
}
function buildUserSession(input) {
    return {
        base_url: input.city_url,
        town_id: readString(input.town_id) || "town_downcity",
        user_token: input.user_token,
        user_id: readString(input.user_id) || undefined,
        user_label: readString(input.user_label) || undefined,
        updated_at: new Date().toISOString(),
    };
}
async function buildVerifiedUserSession(input) {
    const verified = await readUserSessionFromToken(input);
    return buildUserSession({
        ...input,
        user_id: verified.user_id || input.user_id,
        user_label: verified.user_label || input.user_label,
    });
}
async function readUserSessionFromToken(input) {
    const client = new City({
        role: "user",
        city_url: input.city_url,
        town_id: input.town_id,
        user_token: input.user_token,
    });
    const result = await client.service("accounts").get("me");
    const user_id = readString(result.user?.user_id);
    const email = readString(result.profile?.email);
    const display_name = readString(result.profile?.display_name);
    return {
        user_id: user_id || undefined,
        user_label: email || display_name || user_id || undefined,
    };
}
function openBrowser(url) {
    const command = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
    const args = process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];
    try {
        const result = spawnSync(command, args, {
            stdio: "ignore",
        });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function formatOAuthProviderLabel(provider) {
    const normalized = provider.trim().toLowerCase();
    if (!normalized)
        return "OAuth";
    if (normalized === "github")
        return "GitHub";
    if (normalized === "google")
        return "Google";
    if (normalized === "wechat")
        return "WeChat";
    return normalized
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(" ");
}
/**
 * 执行 Town City user 登录。
 */
export async function performTownCityUserLogin(input) {
    const method = await promptAuthMethod(input.city_url);
    if (!method)
        return null;
    if (method.startsWith("oauth:")) {
        return await oauthAuth(input, method.slice("oauth:".length));
    }
    if (method === "register") {
        return await emailRegister(input);
    }
    return await emailLogin(input);
}
//# sourceMappingURL=CityUserLogin.js.map