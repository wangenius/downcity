#!/usr/bin/env node

/**
 * CLI 程序入口模块。
 *
 * 职责说明：
 * 1. 组装所有一级命令（init/console/agent/config/service/extension）。
 * 2. 统一处理命令行参数解析规则（端口、布尔值）。
 */
import { readFileSync, existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import fs from "fs-extra";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { registerConfigCommand } from "./Config.js";
import { initCommand } from "./Init.js";
import { consoleInitCommand } from "./ConsoleInit.js";
import { restartCommand } from "./Restart.js";
import { runCommand } from "./Run.js";
import { registerServicesCommand } from "./Services.js";
import { registerExtensionsCommand } from "./Extensions.js";
import { startCommand } from "./Start.js";
import { statusCommand } from "./Status.js";
import { stopCommand } from "./Stop.js";
import type { StartOptions } from "@agent/types/Start.js";
import { registerAllServicesForCli } from "@agent/service/ServiceCommand.js";
import { registerAllExtensionsForCli } from "@console/extension/ExtensionCommand.js";
import {
  cleanupStaleDaemonFiles,
  getDaemonLogPath,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonPid,
  stopDaemonProcess,
} from "@/console/daemon/Manager.js";
import {
  listConsoleAgents,
  removeConsoleAgentEntry,
} from "@/console/runtime/ConsoleRegistry.js";
import type { ConsoleAgentRuntimeView } from "@/agent/types/Console.js";
import {
  getConsoleAgentRegistryPath,
  getConsoleLogPath,
  getConsolePidPath,
  getConsoleRuntimeDirPath,
} from "@/console/runtime/ConsolePaths.js";
import {
  isConsoleProcessAlive,
  isConsoleRunning,
  readConsolePid,
} from "@/console/runtime/ConsoleRuntime.js";

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
    // 关键点（中文）：`--json` 场景禁止在 stdout 混入 banner，避免破坏机器可解析输出。
    const hasJsonMode = args.some((arg) => {
      if (!arg || typeof arg !== "object") return false;
      if (!Object.prototype.hasOwnProperty.call(arg, "json")) return false;
      return (arg as { json?: unknown }).json === true;
    });
    if (!hasJsonMode) {
      console.log(`sma version: ${packageJson.version}`);
    }
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

/**
 * 异步睡眠工具。
 */
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

async function startConsoleCommand(): Promise<void> {
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();
  await fs.ensureDir(consoleDir);

  const existingPid = await readConsolePid();
  if (existingPid && isConsoleProcessAlive(existingPid)) {
    console.log("ℹ️  SMA console is already running");
    console.log(`   pid: ${existingPid}`);
    return;
  }
  if (existingPid) {
    await fs.remove(pidPath);
  }

  const cliPath = resolve(__dirname, "./Index.js");
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [cliPath, "console", "run"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      SHIPMYAGENT_CONSOLE: "1",
    },
  });

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start console process (missing pid)");
  }

  await fs.writeFile(pidPath, String(child.pid), "utf-8");

  console.log("✅ SMA console started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   log: ${logPath}`);
}

/**
 * 停止 console 后台进程（先停子 agent，再停 console）。
 *
 * 策略（中文）
 * - 先停止 console registry 中记录的活跃 agent daemon；
 * - 再优雅停止 console 本身（SIGTERM -> 超时 SIGKILL）；
 * - 最终清理 pid 文件，保证状态可恢复。
 */
async function stopConsoleCommand(params?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 10_000;
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();
  await fs.ensureDir(consoleDir);

  // 先停子 agent daemon
  const views = await resolveRunningConsoleAgents();
  if (views.length > 0) {
    console.log(`Stopping ${views.length} console agents...`);
    for (const item of views) {
      try {
        const result = await stopDaemonProcess({ projectRoot: item.projectRoot });
        if (result.stopped) {
          console.log(`✅ stopped: ${item.projectRoot} (pid=${item.daemonPid})`);
        } else {
          console.log(`ℹ️  already stopped: ${item.projectRoot}`);
        }
        await removeConsoleAgentEntry(item.projectRoot);
      } catch (error) {
        console.log(`❌ stop failed: ${item.projectRoot}`);
        console.log(`   error: ${String(error)}`);
      }
    }
  }

  const consolePid = await readConsolePid();
  if (!consolePid) {
    console.log("ℹ️  SMA console is not running");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    return;
  }

  if (!isConsoleProcessAlive(consolePid)) {
    await fs.remove(pidPath);
    console.log("⚠️  Stale console pid file detected; cleaned up");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    return;
  }

  process.kill(consolePid, "SIGTERM");

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (!isConsoleProcessAlive(consolePid)) break;
    await sleep(200);
  }

  if (isConsoleProcessAlive(consolePid)) {
    process.kill(consolePid, "SIGKILL");
    const forceStartAt = Date.now();
    while (Date.now() - forceStartAt < 2_000) {
      if (!isConsoleProcessAlive(consolePid)) break;
      await sleep(100);
    }
  }

  await fs.remove(pidPath);

  if (isConsoleProcessAlive(consolePid)) {
    console.log("⚠️  SMA console may still be running");
    console.log(`   pid: ${consolePid}`);
  } else {
    console.log("✅ SMA console stopped");
    console.log(`   pid: ${consolePid}`);
  }
  console.log(`   pidFile: ${pidPath}`);
  console.log(`   log: ${logPath}`);
}

async function restartConsoleCommand(): Promise<void> {
  await stopConsoleCommand();
  await startConsoleCommand();
}

async function runConsoleRuntimeCommand(): Promise<void> {
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
  await fs.ensureDir(consoleDir);
  await fs.writeFile(pidPath, String(process.pid), "utf-8");

  const shutdown = async (): Promise<void> => {
    await fs.remove(pidPath);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  // 极简 console runtime：仅保持进程存活，提供统一管理入口。
  setInterval(() => {
    // keep alive
  }, 60_000);
}

/**
 * 解析 console 维护的“正在运行” agent 列表。
 */
async function resolveRunningConsoleAgents(): Promise<ConsoleAgentRuntimeView[]> {
  const entries = await listConsoleAgents();
  const views: ConsoleAgentRuntimeView[] = [];

  for (const entry of entries) {
    const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
    const daemonPid = await readDaemonPid(projectRoot);
    if (!daemonPid || !isDaemonProcessAlive(daemonPid)) {
      // 关键点（中文）：registry 只显示活跃 daemon，遇到 stale 记录直接移除，避免无限膨胀。
      await removeConsoleAgentEntry(projectRoot);
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
  }

  return views.sort((a, b) => a.projectRoot.localeCompare(b.projectRoot));
}

function printRunningConsoleAgents(views: ConsoleAgentRuntimeView[]): void {
  if (views.length === 0) {
    console.log("ℹ️  No running agent daemon managed by console");
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

async function consoleStatusCommand(): Promise<void> {
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();

  const consolePid = await readConsolePid();
  const running = Boolean(consolePid && isConsoleProcessAlive(consolePid));

  if (running) {
    console.log("✅ SMA console is running");
    console.log(`   pid: ${consolePid}`);
  } else {
    console.log("ℹ️  SMA console is not running");
    if (consolePid) console.log("⚠️  Stale console pid file detected");
  }
  console.log(`   pidFile: ${pidPath}`);
  console.log(`   log: ${logPath}`);
  console.log(`   registry: ${getConsoleAgentRegistryPath()}`);

  const runningAgents = await resolveRunningConsoleAgents();
  printRunningConsoleAgents(runningAgents);
}

program
  .name(basename(process.argv[1] || "shipmyagent"))
  .description("把一个代码仓库，启动为一个拥有自主意识和执行能力的 Agent")
  .version(packageJson.version, "-v, --version");

// 保留 -h 给 host 参数，帮助命令只使用 --help
program.helpOption("--help", "display help for command");

program
  .command("init")
  .description("初始化 console（模型/插件等全局配置，写入 ~/.ship/）")
  .option("--force [enabled]", "允许覆盖 ~/.ship/ship.json 与关键 env（危险操作）", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (options: { force?: boolean }) => {
    await consoleInitCommand(options);
  }));

const consoleCommand = program
  .command("console")
  .description("Console（中台）：统一管理多个 agent daemon")
  .helpOption("--help", "display help for command");

consoleCommand
  .command("run")
  .description("internal console runtime")
  .action(runConsoleRuntimeCommand);

consoleCommand
  .command("start")
  .description("启动 console（后台）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await startConsoleCommand();
  }));

consoleCommand
  .command("stop")
  .description("停止 console（先停子 agent，再停 console）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await stopConsoleCommand();
  }));

consoleCommand
  .command("restart")
  .description("重启 console（先停子 agent，再重启）")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await restartConsoleCommand();
  }));

consoleCommand
  .command("status")
  .description("查看 console 与已托管 agent 运行状态")
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async () => {
    await consoleStatusCommand();
  }));

consoleCommand
  .command("agents")
  .description("打印 console 当前托管的活跃 agent daemon 状态")
  .option("--json [enabled]", "以 JSON 输出", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (options?: { json?: boolean }) => {
    const views = await resolveRunningConsoleAgents();
    if (options?.json) {
      globalThis.console.log(
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
    printRunningConsoleAgents(views);
  }));

const agent = program
  .command("agent")
  .description("管理 Agent Runtime：创建/启停/重启")
  .helpOption("--help", "display help for command");

agent
  .command("create [path]")
  .description("创建/初始化一个 Agent 项目")
  .option("-f, --force [enabled]", "允许覆盖已有 ship.json（危险操作）", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (cwd: string = ".", options: { force?: boolean }) => {
    await initCommand(cwd, options);
  }));

agent
  .command("on [path]")
  .description("启动 Agent Runtime（后台/前台）")
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
  .helpOption("--help", "display help for command")
  .action(
    withVersionBanner(
      async (
        cwd: string = ".",
        options: StartOptions & { foreground?: boolean },
      ) => {
        if (!(await isConsoleRunning())) {
          console.error(
            "❌ console is not running. Please run `sma console start` first.",
          );
          process.exit(1);
        }

        injectAgentContext(cwd);

        const shouldForeground = options.foreground === true;

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
  .command("doctor [path]")
  .description("诊断 daemon 状态文件；可选修复僵尸 pid/meta")
  .option("--fix [enabled]", "清理僵尸 daemon 状态文件", parseBoolean)
  .helpOption("--help", "display help for command")
  .action(withVersionBanner(async (
    cwd: string = ".",
    options: { fix?: boolean },
  ) => {
    injectAgentContext(cwd);
    const projectRoot = resolve(String(cwd || "."));
    const pid = await readDaemonPid(projectRoot);

    if (!pid) {
      console.log("✅ No daemon pid file found");
      console.log(`   project: ${projectRoot}`);
      return;
    }

    if (isDaemonProcessAlive(pid)) {
      console.log("✅ Daemon process is alive");
      console.log(`   project: ${projectRoot}`);
      console.log(`   pid: ${pid}`);
      return;
    }

    console.log("⚠️  Stale daemon state detected");
    console.log(`   project: ${projectRoot}`);
    console.log(`   stalePid: ${pid}`);
    console.log(`   log: ${getDaemonLogPath(projectRoot)}`);

    if (options.fix !== true) {
      console.log("   Run `sma agent doctor <path> --fix` to clean stale pid/meta.");
      return;
    }

    await cleanupStaleDaemonFiles(projectRoot);
    console.log("✅ Cleaned stale daemon pid/meta files");
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

registerConfigCommand(consoleCommand);

registerServicesCommand(program);
registerExtensionsCommand(program);

// 服务命令统一注册（chat / skill / task / future services）
registerAllServicesForCli(program);
// 扩展命令统一注册（voice / future extensions）
registerAllExtensionsForCli(program);

program.showHelpAfterError();
program.showSuggestionAfterError();
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
