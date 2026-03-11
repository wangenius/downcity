#!/usr/bin/env node

/**
 * CLI 程序入口模块。
 *
 * 职责说明：
 * 1. 组装所有一级命令（init/agent/config/service/extension/manager）。
 * 2. 统一处理命令行参数解析规则（端口、布尔值）。
 * 3. 处理默认命令回退：未指定已知一级命令时自动转发到 `agent on`。
 */
import { readFileSync, existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import os from "os";
import fs from "fs-extra";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { registerConfigCommand } from "./Config.js";
import { initCommand } from "./Init.js";
import { restartCommand } from "./Restart.js";
import { runCommand } from "./Run.js";
import { registerServicesCommand } from "./Services.js";
import { registerExtensionsCommand } from "./Extensions.js";
import { startCommand } from "./Start.js";
import { statusCommand } from "./Status.js";
import { stopCommand } from "./Stop.js";
import type { StartOptions } from "@main/types/Start.js";
import { registerAllServicesForCli } from "@main/service/ServiceCommand.js";
import { registerAllExtensionsForCli } from "@main/extension/ExtensionCommand.js";
import {
  getServiceRootCommandNames,
} from "@main/service/Manager.js";
import { getExtensionRootCommandNames } from "@main/extension/Manager.js";
import {
  cleanupStaleDaemonFiles,
  getDaemonLogPath,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonPid,
  stopDaemonProcess,
} from "@/main/server/daemon/Manager.js";
import {
  getManagerAgentRegistryPath,
  listManagedAgents,
  removeManagedAgentEntry,
} from "@/main/server/manager/AgentRegistry.js";
import type { ManagedAgentRuntimeView } from "@/main/types/Manager.js";

const MANAGER_DIR = join(os.homedir(), ".ship", "manager");
const MANAGER_PID_PATH = join(MANAGER_DIR, "manager.pid");
const MANAGER_LOG_PATH = join(MANAGER_DIR, "manager.log");

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
 * - 仅用于 runtime 相关命令，避免影响 `config --json` 等结构化输出。
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

function resolveAgentName(projectRoot: string): string {
  const fallback = basename(projectRoot);
  const shipJsonPath = join(projectRoot, "ship.json");
  if (!existsSync(shipJsonPath)) return fallback;

  try {
    const raw = readFileSync(shipJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // ignore parse errors and fallback to dirname
  }

  return fallback;
}

function injectAgentContext(pathInput: string = "."): {
  projectRoot: string;
  agentName: string;
} {
  const projectRoot = resolve(String(pathInput || "."));
  const agentName = resolveAgentName(projectRoot);
  process.env.SMA_AGENT_PATH = projectRoot;
  process.env.SMA_AGENT_NAME = agentName;
  return { projectRoot, agentName };
}

function isManagerProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readManagerPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(MANAGER_PID_PATH, "utf-8");
    const pid = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function startManagerCommand(): Promise<void> {
  await fs.ensureDir(MANAGER_DIR);

  const existingPid = await readManagerPid();
  if (existingPid && isManagerProcessAlive(existingPid)) {
    console.log("ℹ️  SMA manager is already running");
    console.log(`   pid: ${existingPid}`);
    return;
  }
  if (existingPid) {
    await fs.remove(MANAGER_PID_PATH);
  }

  const cliPath = resolve(__dirname, "./Index.js");
  const logFd = fs.openSync(MANAGER_LOG_PATH, "a");

  const child = spawn(process.execPath, [cliPath, "manager", "run"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      SHIPMYAGENT_MANAGER: "1",
    },
  });

  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start manager process (missing pid)");
  }

  await fs.writeFile(MANAGER_PID_PATH, String(child.pid), "utf-8");

  console.log("✅ SMA manager started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   log: ${MANAGER_LOG_PATH}`);
}

async function runManagerRuntimeCommand(): Promise<void> {
  await fs.ensureDir(MANAGER_DIR);
  await fs.writeFile(MANAGER_PID_PATH, String(process.pid), "utf-8");

  const shutdown = async (): Promise<void> => {
    await fs.remove(MANAGER_PID_PATH);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  // 极简 manager runtime：仅保持进程存活，提供统一管理入口。
  setInterval(() => {
    // keep alive
  }, 60_000);
}

/**
 * 解析 manager 维护的“正在运行” agent 列表。
 *
 * 关键点（中文）
 * - 先做每个项目的 stale pid 清理，再判活。
 * - 不在运行的记录会从 registry 移除，保持列表语义稳定（仅显示活跃 agent）。
 */
async function resolveRunningManagedAgents(): Promise<ManagedAgentRuntimeView[]> {
  const entries = await listManagedAgents();
  const views: ManagedAgentRuntimeView[] = [];

  for (const entry of entries) {
    const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
    try {
      await cleanupStaleDaemonFiles(projectRoot);
      const daemonPid = await readDaemonPid(projectRoot);
      if (!daemonPid || !isDaemonProcessAlive(daemonPid)) {
        await removeManagedAgentEntry(projectRoot);
        continue;
      }
      views.push({
        projectRoot,
        registeredPid: entry.pid,
        daemonPid,
        running: true,
        startedAt: entry.startedAt,
        updatedAt: entry.updatedAt,
        logPath: getDaemonLogPath(projectRoot),
      });
    } catch {
      // 关键点（中文）：读取异常时移除脏记录，避免后续 list/status 持续噪音。
      try {
        await removeManagedAgentEntry(projectRoot);
      } catch {
        // ignore
      }
    }
  }

  return views.sort((a, b) => a.projectRoot.localeCompare(b.projectRoot));
}

/**
 * 打印 manager 下活跃 agent 列表。
 */
function printRunningManagedAgents(views: ManagedAgentRuntimeView[]): void {
  if (views.length === 0) {
    console.log("ℹ️  No running agent daemon managed by manager");
    return;
  }

  console.log(`✅ Running agents: ${views.length}`);
  for (const item of views) {
    console.log(`- project: ${item.projectRoot}`);
    console.log(`  pid: ${item.daemonPid}`);
    console.log(`  startedAt: ${item.startedAt}`);
    console.log(`  updatedAt: ${item.updatedAt}`);
    console.log(`  log: ${item.logPath}`);
  }
}

/**
 * `sma manager status`。
 *
 * 关键点（中文）
 * - 同时输出 manager 进程状态 + manager 维护的活跃 agent 列表摘要。
 */
async function managerStatusCommand(): Promise<void> {
  const managerPid = await readManagerPid();
  const managerRunning = Boolean(
    managerPid && isManagerProcessAlive(managerPid),
  );
  if (managerPid && !managerRunning) {
    await fs.remove(MANAGER_PID_PATH);
  }

  if (managerRunning) {
    console.log("✅ SMA manager is running");
    console.log(`   pid: ${managerPid}`);
  } else {
    console.log("ℹ️  SMA manager is not running");
  }
  console.log(`   pidFile: ${MANAGER_PID_PATH}`);
  console.log(`   log: ${MANAGER_LOG_PATH}`);
  console.log(`   registry: ${getManagerAgentRegistryPath()}`);

  const runningAgents = await resolveRunningManagedAgents();
  printRunningManagedAgents(runningAgents);
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

const manager = program
  .command("manager")
  .description("SMA manager internals");

manager
  .command("run")
  .description("internal manager runtime")
  .action(runManagerRuntimeCommand);

manager
  .command("status")
  .description("查看 manager 与已托管 agent 运行状态")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await managerStatusCommand();
  }));

const managerAgents = manager
  .command("agents")
  .description("通过 manager 统一管理 agent daemon");

managerAgents
  .command("list")
  .description("列出 manager 当前托管的活跃 agent daemon")
  .helpOption("--help", "display help for command")
  .option("--json [enabled]", "以 JSON 输出", parseBoolean)
  .action(withVersionBanner(async (options?: { json?: boolean }) => {
    const views = await resolveRunningManagedAgents();
    if (options?.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            count: views.length,
            agents: views,
          },
          null,
          2,
        ),
      );
      return;
    }
    printRunningManagedAgents(views);
  }));

managerAgents
  .command("start <path>")
  .description("启动指定项目的 agent daemon（等价于 `sma agent on <path>`）")
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
  .action(withVersionBanner(async (cwd: string, options: StartOptions) => {
    injectAgentContext(cwd);
    await startCommand(cwd, options);
  }));

managerAgents
  .command("open <path>")
  .description("启动指定项目的 agent daemon（`start` 别名）")
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
  .action(withVersionBanner(async (cwd: string, options: StartOptions) => {
    injectAgentContext(cwd);
    await startCommand(cwd, options);
  }));

managerAgents
  .command("stop <pathOrAll>")
  .description("停止指定项目 agent daemon；传 `all` 可停止全部活跃 agent")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (pathOrAll: string) => {
    const target = String(pathOrAll || "").trim();
    if (!target) {
      throw new Error("pathOrAll is required");
    }

    if (target.toLowerCase() !== "all") {
      injectAgentContext(target);
      await stopCommand(target);
      return;
    }

    const views = await resolveRunningManagedAgents();
    if (views.length === 0) {
      console.log("ℹ️  No running agent daemon to stop");
      return;
    }

    console.log(`Stopping ${views.length} managed agents...`);
    for (const item of views) {
      try {
        const result = await stopDaemonProcess({
          projectRoot: item.projectRoot,
        });
        if (result.stopped) {
          console.log(`✅ stopped: ${item.projectRoot} (pid=${item.daemonPid})`);
        } else {
          console.log(`ℹ️  already stopped: ${item.projectRoot}`);
        }
      } catch (error) {
        console.log(`❌ stop failed: ${item.projectRoot}`);
        console.log(`   error: ${String(error)}`);
      }
    }
  }));

managerAgents
  .command("status <path>")
  .description("查看指定项目的 agent daemon 状态（等价于 `sma agent status <path>`）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (cwd: string) => {
    injectAgentContext(cwd);
    await statusCommand(cwd);
  }));

managerAgents
  .command("restart <path>")
  .description("重启指定项目的 agent daemon（等价于 `sma agent restart <path>`）")
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
  .action(withVersionBanner(async (cwd: string, options: StartOptions) => {
    injectAgentContext(cwd);
    await restartCommand(cwd, options);
  }));

program
  .command("start")
  .description("启动 SMA Manager（后台）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await startManagerCommand();
  }));

program
  .command("status [legacyPath]")
  .description("查看 manager 与已托管 agent 运行状态")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (legacyPath?: string) => {
    if (String(legacyPath || "").trim()) {
      console.log("ℹ️  Top-level `sma status` now shows manager global status.");
      console.log(
        "   Use `sma agent status <path>` for project daemon status.",
      );
    }
    await managerStatusCommand();
  }));

const agent = program
  .command("agent")
  .description("管理 Agent Runtime 启停与重启")
  .helpOption("--help", "display help for command");

agent
  .command("on [path]")
  .description("启动 Agent Runtime（默认后台；--foreground 为前台）")
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
  .option("--foreground [enabled]", "前台启动（仅当前终端）", parseBoolean)
  .option("--daemon [enabled]", "后台启动（兼容参数）", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(
    withVersionBanner(
      async (
        cwd: string = ".",
        options: StartOptions & { daemon?: boolean; foreground?: boolean },
      ) => {
        injectAgentContext(cwd);

        const shouldForeground =
          options.foreground === true || options.daemon === false;

        if (shouldForeground) {
          await runCommand(cwd, options);
          return;
        }

        await startCommand(cwd, options);
      },
    ),
  );

agent
  .command("off [path]")
  .description("停止后台 Agent Runtime（daemon）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (cwd: string = ".") => {
    injectAgentContext(cwd);
    await stopCommand(cwd);
  }));

agent
  .command("status [path]")
  .description("查看后台 Agent Runtime（daemon）状态")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (cwd: string = ".") => {
    injectAgentContext(cwd);
    await statusCommand(cwd);
  }));

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
  .action(withVersionBanner(async (cwd: string = ".", options: StartOptions) => {
    injectAgentContext(cwd);
    await restartCommand(cwd, options);
  }));

registerConfigCommand(program);

registerServicesCommand(program);
registerExtensionsCommand(program);

// 服务命令统一注册（chat / skill / task / future services）
registerAllServicesForCli(program);
// 扩展命令统一注册（voice / future extensions）
registerAllExtensionsForCli(program);

// 每次执行 sma 默认注入当前目录 agent 上下文环境变量。
injectAgentContext(".");

// `sma agent .` => `sma agent on .`
if (process.argv[2] === "agent") {
  const secondArg = process.argv[3];
  const knownAgentSubCommands = new Set([
    "on",
    "off",
    "status",
    "restart",
    "help",
    "--help",
    "-h",
  ]);
  if (
    secondArg &&
    !knownAgentSubCommands.has(secondArg) &&
    !String(secondArg).startsWith("-")
  ) {
    process.argv.splice(3, 0, "on");
  }
}

// 默认行为：`shipmyagent` / `shipmyagent .` / `shipmyagent [on-options]` -> `shipmyagent agent on [path]`
const firstArg = process.argv[2];
const staticRootCommands = [
  init.name(),
  agent.name(),
  "config",
  "start",
  "status",
  "manager",
  // 关键点（中文）：以下命令已移除；仍保留在识别列表里，避免误回退为 `agent on`。
  "restart",
  "alias",
  "run",
  "stop",
  // 关键点（中文）：`services` 已移除，仍保留在识别列表里，避免误回退为 `agent on`。
  "services",
  "service",
  "extensions",
  "extension",
  "help",
];
const serviceRootCommands = getServiceRootCommandNames();
const extensionRootCommands = getExtensionRootCommandNames();
const knownRootCommands = new Set([
  ...staticRootCommands,
  ...serviceRootCommands,
  ...extensionRootCommands,
]);

if (
  !firstArg ||
  (!knownRootCommands.has(firstArg) &&
    !["--help", "-v", "--version"].includes(firstArg))
) {
  process.argv.splice(2, 0, "agent", "on");
}

program.parse();
