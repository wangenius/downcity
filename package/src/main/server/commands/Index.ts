#!/usr/bin/env node

/**
 * CLI 程序入口模块。
 *
 * 职责说明：
 * 1. 组装所有一级命令（init/agent/config/service）。
 * 2. 统一处理命令行参数解析规则（端口、布尔值）。
 * 3. 处理默认命令回退：未指定已知一级命令时自动转发到 `agent on`。
 */
import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { registerConfigCommand } from "./Config.js";
import { initCommand } from "./Init.js";
import { restartCommand } from "./Restart.js";
import { runCommand } from "./Run.js";
import { registerServicesCommand } from "./Services.js";
import { startCommand } from "./Start.js";
import { stopCommand } from "./Stop.js";
import type { StartOptions } from "@main/types/Start.js";
import { registerAllServicesForCli } from "@main/service/ServiceCommand.js";
import {
  getServiceRootCommandNames,
} from "@main/service/Manager.js";

// 在 ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取 package.json 版本号
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../../../package.json"), "utf-8"),
) as { version: string };

const program = new Command();

/**
 * 在关键运行命令执行前打印当前 sma 版本。
 *
 * 说明（中文）
 * - 仅用于 agent on/off/restart 这类运行态命令，避免影响 `config --json` 等结构化输出。
 */
function withVersionBanner<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void> | void,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    console.log(`sma version: ${packageJson.version}`);
    await action(...args);
  };
}

function parsePort(value: string): number {
  const num = Number.parseInt(value, 10);
  if (
    !Number.isFinite(num) ||
    Number.isNaN(num) ||
    !Number.isInteger(num) ||
    num <= 0 ||
    num > 65535
  ) {
    throw new Error(`Invalid port: ${value}`);
  }
  return num;
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined) return true;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

program
  .name(basename(process.argv[1] || "shipmyagent"))
  .description("把一个代码仓库，启动为一个拥有自主意识和执行能力的 Agent")
  .version(packageJson.version, "-v, --version");

// 保留 -h 给 host 参数，帮助命令只使用 --help
program.helpOption("--help", "display help for command");

const init = program
  .command("init [path]")
  .description("初始化 ShipMyAgent 项目")
  .helpOption("--help", "display help for command")
  .action(initCommand);

const agent = program
  .command("agent")
  .description("管理 Agent Runtime 启停与重启")
  .helpOption("--help", "display help for command");

agent
  .command("on [path]")
  .description("启动 Agent Runtime（默认前台；--daemon 为后台）")
  .option("-p, --port <port>", "服务端口（可在 ship.json 的 start.port 配置）", parsePort)
  .option("-h, --host <host>", "服务主机（可在 ship.json 的 start.host 配置）")
  .option(
    "--webui [enabled]",
    "启动交互式 Web 界面（可在 ship.json 的 start.webui 配置）",
    parseBoolean,
  )
  .option(
    "--webport <port>",
    "交互式 Web 界面端口（可在 ship.json 的 start.webport 配置）",
    parsePort,
  )
  .option("--daemon [enabled]", "后台启动（daemon）", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(
    withVersionBanner(
      async (cwd: string = ".", options: StartOptions & { daemon?: boolean }) => {
        if (options.daemon === true) {
          await startCommand(cwd, options);
          return;
        }
        await runCommand(cwd, options);
      },
    ),
  );

agent
  .command("off [path]")
  .description("停止后台 Agent Runtime（daemon）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(stopCommand));

agent
  .command("restart [path]")
  .description("重启后台 Agent Runtime（daemon）")
  .option("-p, --port <port>", "服务端口（可在 ship.json 的 start.port 配置）", parsePort)
  .option("-h, --host <host>", "服务主机（可在 ship.json 的 start.host 配置）")
  .option(
    "--webui [enabled]",
    "启动交互式 Web 界面（可在 ship.json 的 start.webui 配置）",
    parseBoolean,
  )
  .option(
    "--webport <port>",
    "交互式 Web 界面端口（可在 ship.json 的 start.webport 配置）",
    parsePort,
  )
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(restartCommand));

registerConfigCommand(program);

registerServicesCommand(program);

// 服务命令统一注册（chat / skill / task / future services）
registerAllServicesForCli(program);

// 默认行为：`shipmyagent` / `shipmyagent .` / `shipmyagent [on-options]` -> `shipmyagent agent on [path]`
const firstArg = process.argv[2];
const staticRootCommands = [
  init.name(),
  agent.name(),
  "config",
  // 关键点（中文）：以下命令已移除；仍保留在识别列表里，避免误回退为 `agent on`。
  "restart",
  "alias",
  "run",
  "start",
  "stop",
  // 关键点（中文）：`services` 已移除，仍保留在识别列表里，避免误回退为 `agent on`。
  "services",
  "service",
  "help",
];
const serviceRootCommands = getServiceRootCommandNames();
const knownRootCommands = new Set([...staticRootCommands, ...serviceRootCommands]);

if (
  !firstArg ||
  (!knownRootCommands.has(firstArg) &&
    !["--help", "-v", "--version"].includes(firstArg))
) {
  process.argv.splice(2, 0, "agent", "on");
}

program.parse();
