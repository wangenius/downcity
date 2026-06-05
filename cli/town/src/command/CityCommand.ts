/**
 * `town city` 命令装配模块。
 *
 * 关键点（中文）
 * - 所有 commander 注册逻辑统一放在 `src/command/`。
 * - City user 连接、登录和状态读写由 `shared/CityConnection` 提供。
 * - `city` CLI 只负责 admin/base 管理，`town city` 只负责 user login。
 */

import type { Command } from "commander";
import { parseBoolean } from "../shared/IndexSupport.js";
import {
  DEFAULT_TOWN_ID,
  emitCityConnectionStatus,
  emitCityServerList,
  runCityConnectCommand,
  runCityDisconnectCommand,
  runCityLoginCommand,
  runCityLogoutCommand,
  runCityUseCommand,
  runInteractiveCityManager,
} from "../shared/CityConnection.js";

/**
 * 注册 `town city` 命令组。
 */
export function registerCityConnectionCommand(program: Command): void {
  const city = program
    .command("city")
    .description("管理 Town 的 City user 连接与登录态")
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
    .description("查看 Town 当前 City user 连接状态")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action((options: { json?: boolean }) => {
      emitCityConnectionStatus({ as_json: options.json === true });
    });

  city
    .command("list")
    .description("列出 Town 可选择的 City base")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action((options: { json?: boolean }) => {
      emitCityServerList({ as_json: options.json === true });
    });

  city
    .command("connect [url]")
    .description("手动添加并选择一个 City base（默认 base.downcity.ai）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (url: string | undefined, options: { json?: boolean }) => {
      await runCityConnectCommand({
        url,
        as_json: options.json === true,
      });
    });

  city
    .command("use [server]")
    .description("选择一个 City base；可使用 Town 本地或 city admin 已保存 base")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (server: string | undefined, options: { json?: boolean }) => {
      await runCityUseCommand({
        server,
        as_json: options.json === true,
      });
    });

  city
    .command("login [url]")
    .description("以 user 身份登录当前或指定 City base")
    .option("--town-id <townId>", "City town id", DEFAULT_TOWN_ID)
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (
      url: string | undefined,
      options: { townId?: string; json?: boolean },
    ) => {
      await runCityLoginCommand({
        url,
        town_id: options.townId,
        as_json: options.json === true,
      });
    });

  city
    .command("logout")
    .description("清除当前 City base 的 Town user session")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action((options: { json?: boolean }) => {
      runCityLogoutCommand({ as_json: options.json === true });
    });

  city
    .command("disconnect")
    .description("移除当前 Town City base 选择并回到默认 base")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action((options: { json?: boolean }) => {
      runCityDisconnectCommand({ as_json: options.json === true });
    });
}
