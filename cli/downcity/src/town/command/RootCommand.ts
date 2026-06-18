/**
 * Town 根命令装配模块。
 *
 * 关键点（中文）
 * - `town` 只负责本机 Agent 宿主能力，不再混入 City 管理入口。
 * - Agent 生命周期、chat 与 plugin 命令仍按模块装配，避免入口文件膨胀。
 * - City 运维能力统一进入 `city` 命令。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import {
  listPluginsWithoutLifecycle,
  registerPluginActionCommandsForCli,
} from "@downcity/agent";
import { registerPluginsCommand } from "./PluginCommand.js";
import { registerManagedPluginCommandsForCli } from "./ManagedPluginActionCommand.js";
import { registerAgentCommands } from "./AgentCommand.js";
import { registerChatCommand } from "./ChatCommand.js";
import {
  setCliVerbosity,
} from "../../shared/CliReporter.js";
import { registerGatewayCommands } from "./GatewayCommand.js";
import { readPersistedTownCliLocale } from "../shared/CityStateStore.js";
import { runInteractiveTownManager } from "../shared/TownManager.js";
import { helpText, langOptionText, resolveCliLocale, setCliLocale, t } from "../../shared/CliLocale.js";
import { createTownStaticBuiltinPlugins } from "../town/plugins/TownBuiltinPlugins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cli_path = join(__dirname, "../index.js");

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf-8"),
) as { version: string };

/**
 * 解析当前 Town 安装所绑定的 agent runtime 版本号。
 *
 * 关键点（中文）
 * - 这里读取的是 Town 当前安装依赖中的 `@downcity/agent` 版本，
 *   不是 workspace 源码目录里的 package.json。
 * - 这样 `town agent -v` 才能反映"这份 Town CLI 实际会驱动哪个 agent runtime"。
 */
function resolveInstalledAgentVersion(): string {
  const candidate_package_paths = [
    // 关键点（中文）：Town 独立包与 downcity 聚合包都会把依赖放在 package root/node_modules。
    join(__dirname, "../../node_modules/@downcity/agent/package.json"),
    // 关键点（中文）：workspace 开发态的旧布局兜底，便于本地调试。
    join(__dirname, "../../../../packages/agent/package.json"),
  ];

  for (const package_path of candidate_package_paths) {
    try {
      const agentPackageJson = JSON.parse(
        readFileSync(package_path, "utf-8"),
      ) as { version?: string };
      const version = String(agentPackageJson.version || "").trim();
      return version || "unknown";
    } catch {
      // 关键点（中文）：继续尝试下一个布局候选，不把版本读取失败变成命令启动失败。
    }
  }

  return "unknown";
}

/**
 * 注册 Town 命令到给定的 commander 命令组。
 *
 * 关键点（中文）
 * - 将 Town 的所有子命令注册到传入的 `town` command 对象上。
 * - 这样 `city town` 和独立的 `town` 命令可以复用同一套命令注册逻辑。
 */
export function registerTownCommands(town: Command): void {
  const installedAgentVersion = resolveInstalledAgentVersion();
  const builtinPlugins = createTownStaticBuiltinPlugins();

  registerGatewayCommands(town, {
    version: packageJson.version,
    cliPath: cli_path,
  });
  registerAgentCommands(town, {
    version: packageJson.version,
    agentVersion: installedAgentVersion,
    hiddenPortOption: Option,
  });
  registerChatCommand(town);

  registerPluginsCommand(town);

  // 关键点（中文）：受 agent 托管的 plugin 命令统一注册（chat / task / memory / shell / future managed plugins）。
  registerManagedPluginCommandsForCli(town, builtinPlugins);
  // 关键点（中文）：非生命周期 plugin actions 仍由 agent 包的命令注册器统一装配。
  registerPluginActionCommandsForCli({
    program: town,
    plugins: listPluginsWithoutLifecycle(builtinPlugins),
  });

  town.showHelpAfterError();
  town.showSuggestionAfterError();
}

/**
 * 执行 Town CLI（独立入口模式）。
 *
 * 关键点（中文）
 * - 当用户直接执行 `town` 命令时调用。
 * - 创建自己的 commander program 并注册所有 Town 命令。
 */
export async function runTownCli(): Promise<void> {
  const program = new Command();
  const argv = process.argv.slice(2);
  const cli_locale = resolveCliLocale({
    argv,
    persisted_locale: readPersistedTownCliLocale(),
  });
  setCliLocale(cli_locale);

  program
    .name("town")
    .description(t({
      zh: "在本机启动和管理 Agent 宿主环境",
      en: "start and manage the local Agent host runtime",
    }))
    .version(packageJson.version, "-v, --version");

  program.helpOption("--help", helpText());
  program.option("--lang <locale>", langOptionText());

  program.option("-q, --quiet", t({
    zh: "仅输出错误信息",
    en: "only print error output",
  }));
  program.option("--verbose", t({
    zh: "输出详细进度",
    en: "print verbose progress output",
  }));

  registerTownCommands(program);

  /**
   * 处理 `town agent -v/--version`。
   *
   * 关键点（中文）
   * - commander 根命令会优先消费全局 `-v`，导致 `town agent -v` 默认只显示 Town 版本。
   * - 这里在 parse 前做一次显式分流，确保 agent 命令能返回双版本信息。
   */
  if (
    argv[0] === "agent" &&
    argv.length === 2 &&
    (argv[1] === "-v" || argv[1] === "--version")
  ) {
    const installedAgentVersion = resolveInstalledAgentVersion();
    console.log(`town ${packageJson.version} (agent ${installedAgentVersion})`);
    process.exit(0);
  }

  if (process.argv.length <= 2) {
    await runInteractiveTownManager({
      program,
      cli_path,
    });
    process.exit(0);
  }

  // 关键点（中文）：在 parse 前解析 --quiet / --verbose，设置全局 verbosity。
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals<{ quiet?: boolean; verbose?: boolean }>();
    if (opts.quiet) setCliVerbosity("quiet");
    else if (opts.verbose) setCliVerbosity("verbose");
  });

  await program.parseAsync();
}
