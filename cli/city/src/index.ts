#!/usr/bin/env node

/**
 * City 命令入口模块。
 *
 * 关键点（中文）
 * - `city` 是 Downcity 官方的 City 管理命令，负责连接和管理 City 服务资源。
 * - 默认无参数时打开交互式 City 管理界面，脚本化场景则使用显式子命令。
 * - 本机 Agent 宿主、Console、daemon、start/status/run 等运行态命令属于 `studio`。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runTerminalApp } from "./app.js";
import { createVersionBanner } from "./shared/IndexSupport.js";
import { setCliVerbosity } from "./shared/CliReporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("city")
  .description("管理 Downcity City 服务、账户、模型与资源")
  .version(packageJson.version, "-v, --version");

program.helpOption("--help", "display help for command");
program.option("-q, --quiet", "仅输出错误信息");
program.option("--verbose", "输出详细进度");

program
  .command("manage [action]")
  .description("打开 City 交互式管理界面")
  .helpOption("--help", "display help for command")
  .action(createVersionBanner(packageJson.version, async (action?: string) => {
    await runTerminalApp(action ? [action] : []);
  }));

program.showHelpAfterError();
program.showSuggestionAfterError();

// 关键点（中文）：在 parse 前解析 --quiet / --verbose，设置全局 verbosity。
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals<{ quiet?: boolean; verbose?: boolean }>();
  if (opts.quiet) setCliVerbosity("quiet");
  else if (opts.verbose) setCliVerbosity("verbose");
});

if (process.argv.length <= 2) {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
    await runTerminalApp();
    process.exit(0);
  }
  program.outputHelp();
  process.exit(0);
}

await program.parseAsync();
