/**
 * `town city` 命令装配模块。
 *
 * 关键点（中文）
 * - 所有 commander 注册逻辑统一放在 `src/command/`。
 * - City user 连接、登录和状态读写由 `shared/CityConnection` 提供。
 * - `city` CLI 只负责 admin/base 管理，`town city` 只负责 user login。
 */
import { parseBoolean } from "../shared/IndexSupport.js";
import { DEFAULT_TOWN_ID } from "../shared/CityStateStore.js";
import { emitCityConnectionStatus, emitCityUserWhoami, emitCityServerList, runCityConnectCommand, runCityDisconnectCommand, runCityLoginCommand, runCityLogoutCommand, runCityUseCommand, runInteractiveCityManager, } from "../shared/CityConnection.js";
import { helpText, t } from "../shared/CliLocale.js";
/**
 * 注册 `town city` 命令组。
 */
export function registerCityConnectionCommand(program) {
    const city = program
        .command("city")
        .description(t({
        zh: "管理 Town 的 City user 连接与登录态",
        en: "manage Town City user connections and login state",
    }))
        .helpOption("--help", helpText())
        .action(async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            city.outputHelp();
            return;
        }
        await runInteractiveCityManager();
    });
    city
        .command("status")
        .description(t({
        zh: "查看 Town 当前 City user 连接状态",
        en: "show the current Town City user connection status",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action((options) => {
        emitCityConnectionStatus({ as_json: options.json === true });
    });
    city
        .command("list")
        .description(t({
        zh: "列出 Town 可选择的 City base",
        en: "list City bases available to Town",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action((options) => {
        emitCityServerList({ as_json: options.json === true });
    });
    city
        .command("whoami")
        .description(t({
        zh: "查看 Town 当前实际使用的 City user",
        en: "show the current City user resolved by Town",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action(async (options) => {
        await emitCityUserWhoami({ as_json: options.json === true });
    });
    city
        .command("connect [url]")
        .description(t({
        zh: "手动添加并选择一个 City base（默认 base.downcity.ai）",
        en: "manually add and select a City base (default: base.downcity.ai)",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action(async (url, options) => {
        await runCityConnectCommand({
            url,
            as_json: options.json === true,
        });
    });
    city
        .command("use [server]")
        .description(t({
        zh: "选择一个 City base；可使用 Town 本地或 city admin 已保存 base",
        en: "select a City base from Town-local or city-admin saved bases",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action(async (server, options) => {
        await runCityUseCommand({
            server,
            as_json: options.json === true,
        });
    });
    city
        .command("login [url]")
        .description(t({
        zh: "以 user 身份登录当前或指定 City base",
        en: "sign in to the current or specified City base as a user",
    }))
        .option("--town-id <townId>", t({
        zh: "City town id",
        en: "City town id",
    }), DEFAULT_TOWN_ID)
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action(async (url, options) => {
        await runCityLoginCommand({
            url,
            town_id: options.townId,
            as_json: options.json === true,
        });
    });
    city
        .command("logout")
        .description(t({
        zh: "清除当前 City base 的 Town user session",
        en: "clear the Town user session for the current City base",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action((options) => {
        runCityLogoutCommand({ as_json: options.json === true });
    });
    city
        .command("disconnect")
        .description(t({
        zh: "移除当前 Town City base 选择并回到默认 base",
        en: "remove the current Town City base selection and fall back to the default base",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .action((options) => {
        runCityDisconnectCommand({ as_json: options.json === true });
    });
}
//# sourceMappingURL=CityCommand.js.map