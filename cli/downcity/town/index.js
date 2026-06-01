#!/usr/bin/env node
/**
 * Town 命令入口模块。
 *
 * 关键点（中文）
 * - `town` 只负责本机 Agent 宿主能力，不再混入 City 管理入口。
 * - Agent 生命周期、chat 与 plugin 命令仍按模块装配，避免入口文件膨胀。
 * - City 运维能力统一进入 `city` 命令。
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import { listPluginsWithoutLifecycle, registerPluginActionCommandsForCli, } from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { registerPluginsCommand } from "./shared/Plugins.js";
import { registerManagedPluginCommandsForCli } from "./shared/ManagedPluginActionCommands.js";
import { registerAgentCommands } from "./shared/IndexAgentCommand.js";
import { registerChatCommand } from "./shared/Chat.js";
import { emitCliHeader, resetCliSectionFlow, setCliVerbosity, } from "./shared/CliReporter.js";
import { registerControlPlaneCommands } from "./control-plane/ControlPlaneCommand.js";
import { runInteractiveTownManager } from "./shared/TownManager.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cli_path = join(__dirname, "index.js");
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
/**
 * 解析当前 Town 安装所绑定的 agent runtime 版本号。
 *
 * 关键点（中文）
 * - 这里读取的是 Town 当前安装依赖中的 `@downcity/agent` 版本，
 *   不是 workspace 源码目录里的 package.json。
 * - 这样 `town agent -v` 才能反映“这份 Town CLI 实际会驱动哪个 agent runtime”。
 */
function resolveInstalledAgentVersion() {
    const candidate_package_paths = [
        // 关键点（中文）：Town 独立包与 downcity 聚合包都会把依赖放在 package root/node_modules。
        join(__dirname, "../node_modules/@downcity/agent/package.json"),
        // 关键点（中文）：workspace 开发态的旧布局兜底，便于本地调试。
        join(__dirname, "../../../packages/agent/package.json"),
    ];
    for (const package_path of candidate_package_paths) {
        try {
            const agentPackageJson = JSON.parse(readFileSync(package_path, "utf-8"));
            const version = String(agentPackageJson.version || "").trim();
            return version || "unknown";
        }
        catch {
            // 关键点（中文）：继续尝试下一个布局候选，不把版本读取失败变成命令启动失败。
        }
    }
    return "unknown";
}
const installedAgentVersion = resolveInstalledAgentVersion();
const program = new Command();
const argv = process.argv.slice(2);
const builtinPlugins = createBuiltinPlugins();
program
    .name("town")
    .description("在本机启动和管理 Agent 宿主环境")
    .version(packageJson.version, "-v, --version");
program.helpOption("--help", "display help for command");
program.option("-q, --quiet", "仅输出错误信息");
program.option("--verbose", "输出详细进度");
registerControlPlaneCommands(program, {
    version: packageJson.version,
    cliPath: cli_path,
});
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
 * 处理 `town agent -v/--version`。
 *
 * 关键点（中文）
 * - commander 根命令会优先消费全局 `-v`，导致 `town agent -v` 默认只显示 Town 版本。
 * - 这里在 parse 前做一次显式分流，确保 agent 命令能返回双版本信息。
 */
if (argv[0] === "agent" &&
    argv.length === 2 &&
    (argv[1] === "-v" || argv[1] === "--version")) {
    console.log(`town ${packageJson.version} (agent ${installedAgentVersion})`);
    process.exit(0);
}
if (process.argv.length <= 2) {
    resetCliSectionFlow();
    emitCliHeader(packageJson.version, { command_name: "town" });
    await runInteractiveTownManager({
        program,
        cli_path,
    });
    process.exit(0);
}
// 关键点（中文）：在 parse 前解析 --quiet / --verbose，设置全局 verbosity。
program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.quiet)
        setCliVerbosity("quiet");
    else if (opts.verbose)
        setCliVerbosity("verbose");
});
await program.parseAsync();
//# sourceMappingURL=index.js.map