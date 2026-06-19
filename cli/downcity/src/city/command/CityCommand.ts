/**
 * `city city` 命令装配模块。
 *
 * 关键点（中文）
 * - 所有 commander 注册逻辑统一放在 `src/command/`。
 * - City user 连接、登录和状态读写由 `shared/CityConnection` 提供。
 * - `city` CLI 只负责 admin/base 管理，`city city` 只负责 user login。
 */

import type { Command } from "commander";
import { parseBoolean } from "../../shared/IndexSupport.js";
import { DEFAULT_CITY_ID } from "../shared/CityStateStore.js";
import {
  emitCityConnectionStatus,
  emitCityUserWhoami,
  emitCityServerList,
  runCityConnectCommand,
  runCityDisconnectCommand,
  runCityLoginCommand,
  runCityLogoutCommand,
  runCityUseCommand,
  runInteractiveCityManager,
} from "../shared/CityConnection.js";
import { helpText, t } from "../../shared/CliLocale.js";

/**
 * 注册 `city city` 命令组。
 */
export function registerCityConnectionCommand(program: Command): void {
  const city = program
    .command("city")
    .description(t({
      zh: "管理 City 的 City 连接与账号登录态",
      en: "manage City City connections and account login state",
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
      zh: "查看 City 当前 City 连接状态",
      en: "show the current City City connection status",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action((options: { json?: boolean }) => {
      emitCityConnectionStatus({ as_json: options.json === true });
    });

  city
    .command("list")
    .description(t({
      zh: "列出 City 可选择的 City",
      en: "list Cities available to City",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action((options: { json?: boolean }) => {
      emitCityServerList({ as_json: options.json === true });
    });

  city
    .command("whoami")
    .description(t({
      zh: "查看 City 当前实际使用的 City 账号",
      en: "show the current City account resolved by City",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action(async (options: { json?: boolean }) => {
      await emitCityUserWhoami({ as_json: options.json === true });
    });

  city
    .command("connect [url]")
    .description(t({
      zh: "手动添加并选择一个 City（默认 base.downcity.ai）",
      en: "manually add and select a City (default: base.downcity.ai)",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action(async (url: string | undefined, options: { json?: boolean }) => {
      await runCityConnectCommand({
        url,
        as_json: options.json === true,
      });
    });

  city
    .command("use [city]")
    .description(t({
      zh: "选择一个 City；可使用 City 本地或 city admin 已保存 City",
      en: "select a City from City-local or city-admin saved Cities",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action(async (server: string | undefined, options: { json?: boolean }) => {
      await runCityUseCommand({
        server,
        as_json: options.json === true,
      });
    });

  city
    .command("login [url]")
    .description(t({
      zh: "登录当前或指定 City",
      en: "sign in to the current or specified City",
    }))
    .option("--city-id <cityId>", t({
      zh: "City city id",
      en: "City city id",
    }), DEFAULT_CITY_ID)
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action(async (
      url: string | undefined,
      options: { cityId?: string; json?: boolean },
    ) => {
      await runCityLoginCommand({
        url,
        city_id: options.cityId,
        as_json: options.json === true,
      });
    });

  city
    .command("logout")
    .description(t({
      zh: "清除当前 City 的 City 登录态",
      en: "clear the City session for the current City",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action((options: { json?: boolean }) => {
      runCityLogoutCommand({ as_json: options.json === true });
    });

  city
    .command("disconnect")
    .description(t({
      zh: "重置 City 的 City 选择并回到默认 City",
      en: "reset the City City selection and fall back to the default City",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean)
    .action((options: { json?: boolean }) => {
      runCityDisconnectCommand({ as_json: options.json === true });
    });
}
