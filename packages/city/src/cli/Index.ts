#!/usr/bin/env node

/**
 * CLI 程序入口模块。
 *
 * 关键点（中文）
 * - 这里只负责 CLI 基础初始化与一级命令装配，不承载具体业务逻辑。
 * - 根命令层统一注册 city runtime、Console、agent、plugin 等入口模块。
 * - 所有具体命令树都继续下沉到各自模块，避免入口文件继续膨胀。
 */

import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import { registerAllPluginsForCli } from "@downcity/plugins";
import { registerPluginsCommand } from "./shared/Plugins.js";
import { registerManagedPluginCommandsForCli } from "./shared/ManagedPluginActionCommands.js";
import { registerControlPlaneCommands } from "./control-plane/ControlPlaneCommand.js";
import { registerAgentCommands } from "./shared/IndexAgentCommand.js";
import { registerEnvCommand } from "./shared/Env.js";
import { registerTokenCommand } from "./shared/Token.js";
import { registerResetCommand } from "./shared/Reset.js";
import { registerChatCommand } from "./shared/Chat.js";
import { setCliVerbosity } from "./shared/CliReporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "./Index.js");
const require = createRequire(import.meta.url);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

/**
 * 解析当前 city 安装所绑定的 agent runtime 版本号。
 *
 * 关键点（中文）
 * - 这里读取的是 city 当前安装依赖中的 `@downcity/agent` 版本，
 *   不是 workspace 源码目录里的 package.json。
 * - 这样 `city agent -v` 才能反映“这份 city CLI 实际会驱动哪个 agent runtime”。
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

program
  .name(basename(process.argv[1] || "downcity"))
  .description("把一个代码仓库，启动为一个拥有自主意识和执行能力的 Agent")
  .version(packageJson.version, "-v, --version");

program.helpOption("--help", "display help for command");

program.option("-q, --quiet", "仅输出错误信息");
program.option("--verbose", "输出详细进度");

registerControlPlaneCommands(program, {
  version: packageJson.version,
  cliPath,
});

registerAgentCommands(program, {
  version: packageJson.version,
  agentVersion: installedAgentVersion,
  hiddenPortOption: Option,
});
registerTokenCommand(program);
registerEnvCommand(program);
registerResetCommand(program);
registerChatCommand(program);

registerPluginsCommand(program);

// 受 agent 托管的 plugin 命令统一注册（chat / task / memory / shell / future managed plugins）
registerManagedPluginCommandsForCli(program);
// 插件命令统一注册（skill / asr / tts / future plugins）
registerAllPluginsForCli(program);

program.showHelpAfterError();
program.showSuggestionAfterError();

/**
 * 处理 `city agent -v/--version`。
 *
 * 关键点（中文）
 * - commander 根命令会优先消费全局 `-v`，导致 `city agent -v` 默认只显示 city 版本。
 * - 这里在 parse 前做一次显式分流，确保 agent 命令能返回双版本信息。
 */
if (
  argv[0] === "agent" &&
  argv.length === 2 &&
  (argv[1] === "-v" || argv[1] === "--version")
) {
  console.log(`city ${packageJson.version} (agent ${installedAgentVersion})`);
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
