#!/usr/bin/env node

/**
 * CLI 程序入口模块。
 *
 * 职责说明：
 * 1. 只负责 CLI 基础初始化与一级命令装配。
 * 2. 具体命令树拆分到 console/agent 等独立模块。
 */

import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import { registerServicesCommand } from "./Services.js";
import { registerPluginsCommand } from "./Plugins.js";
import { registerAllServicesForCli } from "@/main/service/ServiceCommand.js";
import { registerAllPluginsForCli } from "@/main/plugin/PluginCommand.js";
import { registerConsoleCommands } from "./IndexConsoleCommand.js";
import { registerAgentCommands } from "./IndexAgentCommand.js";
import { registerKeysCommand } from "./Keys.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "./Index.js");

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name(basename(process.argv[1] || "downcity"))
  .description("把一个代码仓库，启动为一个拥有自主意识和执行能力的 Agent")
  .version(packageJson.version, "-v, --version");

program.helpOption("--help", "display help for command");

registerConsoleCommands(program, {
  version: packageJson.version,
  cliPath,
});

registerAgentCommands(program, {
  version: packageJson.version,
  hiddenPortOption: Option,
});
registerKeysCommand(program);

registerServicesCommand(program);
registerPluginsCommand(program);

// 服务命令统一注册（chat / task / memory / shell / future services）
registerAllServicesForCli(program);
// 插件命令统一注册（skill / asr / tts / future plugins）
registerAllPluginsForCli(program);

program.showHelpAfterError();
program.showSuggestionAfterError();
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
