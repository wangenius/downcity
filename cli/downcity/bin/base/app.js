#!/usr/bin/env node
/**
 * Downcity Federation 交互入口与工作区调度。
 *
 * 状态流转：
 *   welcome/home → connect/switch Federation → server workspace → server management/admin tools
 *
 * 关键说明（中文）
 * - `downfed` 只负责 Federation 与 admin 管理。
 * - user 登录与本机 runtime 统一由 `downcity` 承担。
 */
import { readFileSync } from "node:fs";
import { isCancel, select } from "./tui/Prompts.js";
import { readActiveServer, setActiveServer, writePersistedCliLocale, } from "./core/session.js";
import { parseArgs } from "./core/env.js";
import { promptAddServer } from "./auth/server-switch.js";
import { show, showError, showSuccess } from "./core/ui.js";
import { updateCli } from "./core/update.js";
import { getCliLocale, setCliLocale, t } from "./i18n.js";
import { openServerWorkspace } from "./workspace/ServerWorkspace.js";
import { open_city_dashboard } from "./tui/CityDashboard.js";
export async function runFederationApp(argv = []) {
    const cli = parseArgs(argv);
    if (cli.command === "update") {
        await runSelfUpdate();
        return;
    }
    await open_city_dashboard({
        run_welcome_action: run_welcome_dashboard_action,
        run_home_action: run_home_dashboard_action,
    });
}
/**
 * 交互式切换并持久化 City CLI 语言。
 */
async function promptAndPersistCityCliLocale() {
    const current_locale = getCliLocale();
    const selected_locale = await select({
        message: t({
            zh: "选择 City CLI 语言",
            en: "Choose the City CLI language",
        }),
        options: [
            {
                label: "English",
                value: "en",
                hint: current_locale === "en"
                    ? t({
                        zh: "当前",
                        en: "Current",
                    })
                    : undefined,
            },
            {
                label: "中文",
                value: "zh",
                hint: current_locale === "zh"
                    ? t({
                        zh: "当前",
                        en: "Current",
                    })
                    : undefined,
            },
        ],
    });
    if (!selected_locale || isCancel(selected_locale)) {
        return;
    }
    const cli_locale = selected_locale;
    setCliLocale(cli_locale);
    writePersistedCliLocale(cli_locale);
    showSuccess(t({
        zh: cli_locale === "zh" ? "已切换为中文，并保存为默认语言" : "已切换为英文，并保存为默认语言",
        en: cli_locale === "zh"
            ? "Switched to Chinese and saved as the default language"
            : "Switched to English and saved as the default language",
    }));
}
/**
 * 读取当前 CLI 包版本。
 *
 * 关键说明（中文）
 * - 运行源码时从仓库 package.json 读取
 * - 发布后的全局安装同样从包根目录 package.json 读取
 * - 读取失败时回退到 unknown，避免 CLI 启动被版本展示阻断
 */
function readCliVersion() {
    try {
        const packageJsonPath = new URL("../package.json", import.meta.url);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        return String(packageJson.version ?? "unknown");
    }
    catch {
        return "unknown";
    }
}
/**
 * 执行 CLI 自更新，并提示用户重新启动。
 */
async function runSelfUpdate() {
    try {
        show(t({
            zh: "正在更新 downcity CLI...",
            en: "Updating downcity CLI...",
        }));
        const result = await updateCli();
        showSuccess(t({
            zh: `CLI 已通过 ${result.mode} 模式更新到 v${result.version}`,
            en: `CLI updated via ${result.mode} mode -> v${result.version}`,
        }));
        show(t({
            zh: "请重新运行 `city` 以使用更新后的 CLI。",
            en: "Please run `city` again to use the updated CLI.",
        }));
    }
    catch (error) {
        showError(error instanceof Error ? error.message : String(error));
    }
}
/**
 * 执行欢迎页动作。
 */
async function run_welcome_dashboard_action(action) {
    if (action === "quit") {
        return "quit";
    }
    if (action === "more") {
        await run_city_more_actions();
        return "refresh";
    }
    const connected_server = await promptAddServer();
    if (!connected_server) {
        return "refresh";
    }
    const result = await openServerWorkspace(connected_server.base_url);
    return result === "quit" ? "quit" : "refresh";
}
/**
 * 执行首页动作。
 */
async function run_home_dashboard_action(action) {
    if (action === "quit") {
        return "quit";
    }
    if (action === "more") {
        await run_city_more_actions();
        return "refresh";
    }
    if (action === "connect_city") {
        const connected_server = await promptAddServer();
        if (!connected_server) {
            return "refresh";
        }
        const result = await openServerWorkspace(connected_server.base_url);
        return result === "quit" ? "quit" : "refresh";
    }
    if (action.startsWith("open_server:")) {
        const base_url = action.slice("open_server:".length).trim();
        if (!base_url) {
            return "refresh";
        }
        setActiveServer(base_url);
        const result = await openServerWorkspace(base_url);
        return result === "quit" ? "quit" : "refresh";
    }
    const active_server = readActiveServer();
    if (!active_server) {
        return "refresh";
    }
    const result = await openServerWorkspace(active_server.base_url);
    return result === "quit" ? "quit" : "refresh";
}
async function run_city_more_actions() {
    const current_locale = getCliLocale();
    const selected_action = await select({
        message: t({
            zh: "更多",
            en: "More",
        }),
        options: [
            {
                label: t({
                    zh: "切换语言",
                    en: "Language",
                }),
                value: "set_language",
                hint: current_locale === "zh"
                    ? t({ zh: "当前默认语言：中文", en: "Current default language: Chinese" })
                    : t({ zh: "当前默认语言：英文", en: "Current default language: English" }),
            },
            {
                label: t({
                    zh: "升级 CLI",
                    en: "Upgrade CLI",
                }),
                value: "update",
                hint: t({
                    zh: "刷新全局 city 命令",
                    en: "Refresh the global city command",
                }),
            },
        ],
    });
    if (!selected_action || isCancel(selected_action)) {
        return;
    }
    if (selected_action === "set_language") {
        await promptAndPersistCityCliLocale();
        return;
    }
    await runSelfUpdate();
}
//# sourceMappingURL=app.js.map