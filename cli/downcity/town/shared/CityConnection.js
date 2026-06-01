/**
 * `town city` 命令与 City 连接管理。
 *
 * 关键点（中文）
 * - Town 只负责连接 City：URL、town_id、user_token 进入平台 env，供 Agent runtime 使用。
 * - City 模型、服务、账号、计费等资源仍由 `city` CLI 管理。
 * - 优先复用 `city` CLI 的 server/session 配置，避免 Town 维护第二套 server 事实源。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import prompts from "prompts";
import { PlatformStore } from "../platform/store/index.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { parseBoolean } from "./IndexSupport.js";
const CITY_CONFIG_PATH = path.join(os.homedir(), ".downcity", "config.json");
const CITY_ENV_KEYS = [
    "DOWNCITY_CITY_URL",
    "DOWNCITY_CITY_TOWN_ID",
    "DOWNCITY_CITY_USER_TOKEN",
];
const DEFAULT_TOWN_ID = "town_downcity";
function readString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function defaultProtocol(value) {
    const host = value.split("/")[0] ?? "";
    const clean_host = host.split(":")[0] ?? "";
    if (clean_host === "localhost" ||
        clean_host.includes(":") ||
        clean_host.split(".").length === 4) {
        return "http";
    }
    return "https";
}
function normalizeCityUrl(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    const has_protocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(raw);
    const with_protocol = has_protocol ? raw : `${defaultProtocol(raw)}://${raw}`;
    const url = new URL(with_protocol);
    if (!url.port &&
        (url.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/u.test(url.hostname))) {
        url.port = "43127";
    }
    return url.toString().replace(/\/+$/, "");
}
function deriveServerName(city_url) {
    try {
        return new URL(city_url).hostname || city_url;
    }
    catch {
        return city_url;
    }
}
function hashCityUrl(city_url) {
    return crypto.createHash("sha256").update(city_url).digest("hex").slice(0, 16);
}
function readJsonFile(file_path) {
    try {
        return JSON.parse(fs.readFileSync(file_path, "utf8"));
    }
    catch {
        return null;
    }
}
function readCityUserSession(city_url) {
    const file_path = path.join(os.homedir(), ".downcity", "servers", hashCityUrl(city_url), "user.json");
    return readJsonFile(file_path);
}
function readCityCliServers() {
    const raw = readJsonFile(CITY_CONFIG_PATH);
    const servers = Array.isArray(raw?.servers) ? raw.servers : [];
    const active_url = normalizeCityUrl(readString(raw?.active_server_url));
    const out = [];
    for (const item of servers) {
        const city_url = normalizeCityUrl(readString(item.base_url) || readString(item.url));
        if (!city_url || out.some((server) => server.base_url === city_url))
            continue;
        const user_session = readCityUserSession(city_url);
        const user_token = readString(user_session?.user_token);
        out.push({
            name: readString(item.name) || deriveServerName(city_url),
            base_url: city_url,
            active: city_url === active_url,
            has_admin_secret_key: Boolean(readString(item.admin_secret_key)),
            has_user_session: Boolean(user_token),
            town_id: readString(user_session?.town_id) || undefined,
            user_id: readString(user_session?.user_id) || undefined,
        });
    }
    return out.sort((left, right) => Number(right.active) - Number(left.active)
        || left.name.localeCompare(right.name)
        || left.base_url.localeCompare(right.base_url));
}
function readTownCityEnv() {
    const store = new PlatformStore();
    try {
        return store.getEnvMapSync();
    }
    finally {
        store.close();
    }
}
export function readTownCityConnectionState() {
    const env = readTownCityEnv();
    const city_url = normalizeCityUrl(readString(env.DOWNCITY_CITY_URL));
    const town_id = readString(env.DOWNCITY_CITY_TOWN_ID) || DEFAULT_TOWN_ID;
    const user_token = readString(env.DOWNCITY_CITY_USER_TOKEN);
    if (city_url) {
        return {
            city_url,
            town_id,
            has_user_token: Boolean(user_token),
            source: "town-env",
        };
    }
    const active_server = readCityCliServers().find((server) => server.active)
        ?? readCityCliServers()[0];
    if (active_server) {
        return {
            city_url: active_server.base_url,
            town_id: active_server.town_id || DEFAULT_TOWN_ID,
            has_user_token: active_server.has_user_session,
            source: "city-cli",
        };
    }
    return {
        city_url: "",
        town_id,
        has_user_token: false,
        source: "missing",
    };
}
async function writeTownCityConnection(params) {
    const store = new PlatformStore();
    try {
        await store.upsertGlobalEnvEntry({
            key: "DOWNCITY_CITY_URL",
            value: params.city_url,
            description: "Town 当前连接的 City 服务地址。",
        });
        await store.upsertGlobalEnvEntry({
            key: "DOWNCITY_CITY_TOWN_ID",
            value: params.town_id,
            description: "Town Agent runtime 调用 City 时使用的 town id。",
        });
        if (params.user_token !== undefined) {
            await store.upsertGlobalEnvEntry({
                key: "DOWNCITY_CITY_USER_TOKEN",
                value: params.user_token,
                description: "Town Agent runtime 调用 City 用户态服务时使用的 user token。",
            });
        }
    }
    finally {
        store.close();
    }
}
function clearTownCityConnection() {
    const store = new PlatformStore();
    try {
        for (const key of CITY_ENV_KEYS) {
            store.removeGlobalEnvEntry(key);
        }
    }
    finally {
        store.close();
    }
}
function findCityCliServer(input) {
    const query = String(input || "").trim();
    const servers = readCityCliServers();
    if (!query)
        return servers.find((server) => server.active) ?? servers[0] ?? null;
    const normalized_query_url = normalizeCityUrl(query);
    return servers.find((server) => server.name === query ||
        server.base_url === normalized_query_url ||
        server.base_url === query) ?? null;
}
function emitCityConnectionStatus(options) {
    const state = readTownCityConnectionState();
    const servers = readCityCliServers();
    if (options?.as_json === true) {
        printResult({
            asJson: true,
            success: state.source !== "missing",
            title: "city connection",
            payload: {
                connection: state,
                cityCliServers: servers,
            },
        });
        return;
    }
    if (state.source === "missing") {
        emitCliBlock({
            tone: "warning",
            title: "City connection",
            summary: "missing",
            note: "Run `town city connect <url> --user-token <token>` or configure/login with `city`, then run `town city use`.",
        });
        return;
    }
    emitCliBlock({
        tone: state.has_user_token ? "success" : "warning",
        title: "City connection",
        summary: state.source === "town-env" ? "connected" : "available from city cli",
        facts: [
            { label: "url", value: state.city_url },
            { label: "town", value: state.town_id },
            { label: "user token", value: state.has_user_token ? "configured" : "missing" },
            { label: "source", value: state.source },
        ],
        note: state.source === "city-cli"
            ? "Run `town city use` to import the active city CLI session into Town runtime env."
            : undefined,
    });
}
function emitCityServerList(options) {
    const servers = readCityCliServers();
    if (options?.as_json === true) {
        printResult({
            asJson: true,
            success: true,
            title: "city servers",
            payload: {
                count: servers.length,
                servers,
            },
        });
        return;
    }
    if (servers.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "City servers",
            summary: "0 configured",
            note: "Run `city` to add and login to a City server, or use `town city connect <url>` for Town only.",
        });
        return;
    }
    emitCliList({
        tone: "accent",
        title: "City servers",
        summary: `${servers.length} configured`,
        items: servers.map((server) => ({
            tone: server.active ? "success" : "info",
            title: server.name,
            facts: [
                { label: "url", value: server.base_url },
                { label: "active", value: server.active ? "yes" : "no" },
                { label: "user session", value: server.has_user_session ? "yes" : "no" },
                { label: "town", value: server.town_id || "-" },
            ],
        })),
    });
}
async function runCityConnectCommand(params) {
    let city_url = normalizeCityUrl(String(params.url || ""));
    let town_id = String(params.town_id || "").trim() || DEFAULT_TOWN_ID;
    let user_token = String(params.user_token || "").trim();
    if (!city_url && process.stdin.isTTY && process.stdout.isTTY) {
        const response = (await prompts([
            {
                type: "text",
                name: "city_url",
                message: "City URL",
            },
            {
                type: "text",
                name: "town_id",
                message: "Town ID",
                initial: town_id,
            },
            {
                type: "password",
                name: "user_token",
                message: "User token（可选，留空只保存 URL）",
            },
        ]));
        city_url = normalizeCityUrl(String(response.city_url || ""));
        town_id = String(response.town_id || "").trim() || DEFAULT_TOWN_ID;
        user_token = String(response.user_token || "").trim();
    }
    if (!city_url) {
        printResult({
            asJson: params.as_json === true,
            success: false,
            title: "city connect failed",
            payload: {
                error: "City URL is required",
                fix: "town city connect <url> --user-token <token>",
            },
        });
        return;
    }
    await writeTownCityConnection({
        city_url,
        town_id,
        ...(user_token ? { user_token } : {}),
    });
    printResult({
        asJson: params.as_json === true,
        success: true,
        title: "city connected",
        payload: {
            city_url,
            town_id,
            has_user_token: Boolean(user_token),
        },
    });
}
async function runCityUseCommand(params) {
    const server = findCityCliServer(params.server);
    if (!server) {
        printResult({
            asJson: params.as_json === true,
            success: false,
            title: "city use failed",
            payload: {
                error: "No city CLI server matched the input",
                fix: "Run `city` to configure a server, or `town city list` to inspect known servers.",
            },
        });
        return;
    }
    const session = readCityUserSession(server.base_url);
    const user_token = readString(session?.user_token);
    await writeTownCityConnection({
        city_url: server.base_url,
        town_id: readString(session?.town_id) || server.town_id || DEFAULT_TOWN_ID,
        ...(user_token ? { user_token } : {}),
    });
    printResult({
        asJson: params.as_json === true,
        success: Boolean(user_token),
        title: user_token ? "city session imported" : "city server imported without user token",
        payload: {
            city_url: server.base_url,
            town_id: readString(session?.town_id) || server.town_id || DEFAULT_TOWN_ID,
            has_user_token: Boolean(user_token),
            fix: user_token ? undefined : "Run `city` and login as user, then run `town city use` again.",
        },
    });
}
async function promptCityManagerAction() {
    const state = readTownCityConnectionState();
    const servers = readCityCliServers();
    const response = (await prompts({
        type: "select",
        name: "action",
        message: "管理 City 连接",
        choices: [
            {
                title: "查看连接状态",
                description: state.source === "missing" ? "当前未连接" : state.city_url,
                value: "status",
            },
            {
                title: "导入 city CLI 当前会话",
                description: `${servers.length} 个 city server 可用`,
                value: "use",
            },
            {
                title: "手动连接 City",
                description: "写入 Town runtime 所需的 URL / town_id / user_token",
                value: "connect",
            },
            {
                title: "查看 city CLI servers",
                description: "只读展示，不管理 City 资源",
                value: "list",
            },
            {
                title: "断开 Town City 连接",
                description: "删除 Town 平台 env 中的 City 连接项",
                value: "disconnect",
            },
            {
                title: "退出",
                description: "关闭 City 连接管理",
                value: "exit",
            },
        ],
        initial: state.source === "missing" ? 1 : 0,
    }));
    return String(response.action || "").trim() || null;
}
/**
 * 运行 `town city` 交互式管理器。
 */
export async function runInteractiveCityManager() {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
        return;
    while (true) {
        const action = await promptCityManagerAction();
        if (!action || action === "exit") {
            emitCliBlock({
                tone: "info",
                title: "City manager closed",
            });
            return;
        }
        if (action === "status") {
            emitCityConnectionStatus();
            continue;
        }
        if (action === "list") {
            emitCityServerList();
            continue;
        }
        if (action === "connect") {
            await runCityConnectCommand({});
            continue;
        }
        if (action === "use") {
            await runCityUseCommand({});
            continue;
        }
        if (action === "disconnect") {
            clearTownCityConnection();
            emitCliBlock({
                tone: "success",
                title: "City disconnected",
            });
        }
    }
}
/**
 * 注册 `town city` 命令组。
 */
export function registerCityConnectionCommand(program) {
    const city = program
        .command("city")
        .description("连接 City：只管理 Town 到 City 的连接上下文，不配置 City 模型或服务资源")
        .helpOption("--help", "display help for command")
        .action(async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            city.outputHelp();
            return;
        }
        await runInteractiveCityManager();
    });
    city
        .command("status")
        .description("查看 Town 当前 City 连接状态")
        .option("--json [enabled]", "以 JSON 输出", parseBoolean)
        .action((options) => {
        emitCityConnectionStatus({ as_json: options.json === true });
    });
    city
        .command("list")
        .description("列出 city CLI 已保存的 server")
        .option("--json [enabled]", "以 JSON 输出", parseBoolean)
        .action((options) => {
        emitCityServerList({ as_json: options.json === true });
    });
    city
        .command("connect [url]")
        .description("手动连接 City，并写入 Town runtime 使用的平台 env")
        .option("--town-id <townId>", "City town id", DEFAULT_TOWN_ID)
        .option("--user-token <token>", "City user token")
        .option("--json [enabled]", "以 JSON 输出", parseBoolean)
        .action(async (url, options) => {
        await runCityConnectCommand({
            url,
            town_id: options.townId,
            user_token: options.userToken,
            as_json: options.json === true,
        });
    });
    city
        .command("use [server]")
        .description("从 city CLI 当前或指定 server 导入连接与 user session")
        .option("--json [enabled]", "以 JSON 输出", parseBoolean)
        .action(async (server, options) => {
        await runCityUseCommand({
            server,
            as_json: options.json === true,
        });
    });
    city
        .command("disconnect")
        .description("删除 Town 平台 env 中的 City 连接项")
        .option("--json [enabled]", "以 JSON 输出", parseBoolean)
        .action((options) => {
        clearTownCityConnection();
        printResult({
            asJson: options.json === true,
            success: true,
            title: "city disconnected",
            payload: {
                removed: [...CITY_ENV_KEYS],
            },
        });
    });
}
//# sourceMappingURL=CityConnection.js.map