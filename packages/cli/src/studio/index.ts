#!/usr/bin/env node

/**
 * Studio 命令入口模块。
 *
 * 关键点（中文）
 * - `studio` 只负责本机 Agent 宿主能力，不再混入 City 管理入口。
 * - Agent 生命周期、chat 与 plugin 命令仍按模块装配，避免入口文件膨胀。
 * - City 运维能力统一进入 `city` 命令。
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import {
  listPluginsWithoutLifecycle,
  registerPluginActionCommandsForCli,
} from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { registerPluginsCommand } from "../shared/Plugins.js";
import { registerManagedPluginCommandsForCli } from "../shared/ManagedPluginActionCommands.js";
import { registerAgentCommands } from "../shared/IndexAgentCommand.js";
import { registerChatCommand } from "../shared/Chat.js";
import { setCliVerbosity } from "../shared/CliReporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

/**
 * 解析当前 studio 安装所绑定的 agent runtime 版本号。
 *
 * 关键点（中文）
 * - 这里读取的是 studio 当前安装依赖中的 `@downcity/agent` 版本，
 *   不是 workspace 源码目录里的 package.json。
 * - 这样 `studio agent -v` 才能反映“这份 studio CLI 实际会驱动哪个 agent runtime”。
 */
function resolveInstalledAgentVersion(): string {
  try {
    const agentEntryPath = require.resolve("@downcity/agent");
    const agentPackageJson = JSON.parse(
      readFileSync(join(dirname(agentEntryPath), "../package.json"), "utf-8"),
    ) as { version?: string };
    const version = String(agentPackageJson.version || "").trim();
    return version || "unknown";
  } catch {
    try {
      const siblingAgentPackageJson = JSON.parse(
        readFileSync(join(__dirname, "../../../agent/package.json"), "utf-8"),
      ) as { version?: string };
      const version = String(siblingAgentPackageJson.version || "").trim();
      return version || "unknown";
    } catch {
      return "unknown";
    }
  }
}

const installedAgentVersion = resolveInstalledAgentVersion();

const program = new Command();
const argv = process.argv.slice(2);
const builtinPlugins = createBuiltinPlugins();

program
  .name("studio")
  .description("在本机启动和管理 Agent 宿主环境")
  .version(packageJson.version, "-v, --version");

program.helpOption("--help", "display help for command");

program.option("-q, --quiet", "仅输出错误信息");
program.option("--verbose", "输出详细进度");

registerAgentCommands(program, {
  version: packageJson.version,
  agentVersion: installedAgentVersion,
  hiddenPortOption: Option,
});
registerChatCommand(program);

registerPluginsCommand(program);

// 受 agent 托管的 plugin 命令统一注册（chat / task / memory / shell / future managed plugins）
registerManagedPluginCommandsForCli(program, builtinPlugins);
// 插件命令统一注册（skill / asr / tts / future plugins）
registerPluginActionCommandsForCli({
  program,
  plugins: listPluginsWithoutLifecycle(builtinPlugins),
});

program.showHelpAfterError();
program.showSuggestionAfterError();

/**
 * 处理 `studio agent -v/--version`。
 *
 * 关键点（中文）
 * - commander 根命令会优先消费全局 `-v`，导致 `studio agent -v` 默认只显示 studio 版本。
 * - 这里在 parse 前做一次显式分流，确保 agent 命令能返回双版本信息。
 */
if (
  argv[0] === "agent" &&
  argv.length === 2 &&
  (argv[1] === "-v" || argv[1] === "--version")
) {
  console.log(`studio ${packageJson.version} (agent ${installedAgentVersion})`);
  process.exit(0);
}

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

// 关键点（中文）：在 parse 前解析 --quiet / --verbose，设置全局 verbosity。
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals<{ quiet?: boolean; verbose?: boolean }>();
  if (opts.quiet) setCliVerbosity("quiet");
  else if (opts.verbose) setCliVerbosity("verbose");
});

await program.parseAsync();
