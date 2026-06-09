/**
 * City 根命令装配模块。
 *
 * 关键点（中文）
 * - `city` 是 Downcity 官方的 City 管理命令，负责连接和管理 City 服务资源。
 * - 默认无参数时打开交互式 City 管理界面，脚本化场景则使用显式子命令。
 * - 本机 Agent 宿主、Console、daemon、start/status/run 等运行态命令属于 `town`。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runCityApp } from "../app.js";
import { readPersistedCliLocale } from "../core/session.js";
import { createVersionBanner } from "../shared/IndexSupport.js";
import { setCliVerbosity } from "../shared/CliReporter.js";
import { deployCityProject } from "../deploy/commands/deploy.js";
import { createCityProject } from "../create/commands/create.js";
import { refreshEnvCache } from "../env/commands/refresh.js";
import { helpText, langOptionText, resolveCliLocale, setCliLocale, t } from "../i18n.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
/**
 * 执行 City CLI。
 */
export async function runCityCli() {
    const program = new Command();
    const argv = process.argv.slice(2);
    const cli_locale = resolveCliLocale({
        argv,
        persisted_locale: readPersistedCliLocale(),
    });
    setCliLocale(cli_locale);
    program
        .name("city")
        .description(t({
        zh: "管理 Downcity City 服务、账户、模型与资源",
        en: "Manage Downcity City services, accounts, models, and resources",
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
    program
        .command("manage [action]")
        .description(t({
        zh: "打开 City 交互式管理界面",
        en: "open the interactive City management interface",
    }))
        .helpOption("--help", helpText())
        .action(createVersionBanner(packageJson.version, async (action) => {
        await runCityApp(action ? [action] : []);
    }));
    program
        .command("create [dir]")
        .description(t({
        zh: "交互式创建 City 项目骨架",
        en: "interactively scaffold a City project",
    }))
        .option("-f, --force", t({
        zh: "允许覆盖已有项目文件",
        en: "allow overwriting existing project files",
    }))
        .helpOption("--help", helpText())
        .action(createVersionBanner(packageJson.version, async (dir, options) => {
        await createCityProject(dir ?? ".", options);
    }));
    program
        .command("deploy [source]")
        .description(t({
        zh: "部署当前目录或本地目录中的 City 项目",
        en: "deploy a City project from the current directory or a local path",
    }))
        .option("--dry-run", t({
        zh: "只执行 Wrangler dry-run，不发布 Worker",
        en: "run Wrangler dry-run only without publishing the Worker",
    }))
        .option("--verify", t({
        zh: "部署完成后请求 Worker /health",
        en: "request Worker /health after deployment completes",
    }))
        .option("--verify-only", t({
        zh: "只请求 Worker /health，不构建或部署",
        en: "request Worker /health only without building or deploying",
    }))
        .option("--skip-build", t({
        zh: "跳过 package.json 中的 build",
        en: "skip the package.json build script",
    }))
        .option("--skip-typecheck", t({
        zh: "跳过 package.json 中的 typecheck",
        en: "skip the package.json typecheck script",
    }))
        .option("--account-id <account_id>", t({
        zh: "本次部署使用的 Cloudflare account id",
        en: "use this Cloudflare account id for the deployment",
    }))
        .helpOption("--help", helpText())
        .action(createVersionBanner(packageJson.version, async (source, options) => {
        await deployCityProject(source ?? ".", options);
    }));
    const env_program = program
        .command("env")
        .description(t({
        zh: "管理当前 City 的环境变量运行态能力",
        en: "manage runtime environment capabilities for the current City",
    }))
        .helpOption("--help", helpText());
    env_program
        .command("refresh")
        .description(t({
        zh: "刷新当前 City runtime env cache",
        en: "refresh the current City runtime env cache",
    }))
        .helpOption("--help", helpText())
        .action(createVersionBanner(packageJson.version, async () => {
        await refreshEnvCache();
    }));
    program.showHelpAfterError();
    program.showSuggestionAfterError();
    // 关键点（中文）：在 parse 前解析 --quiet / --verbose，设置全局 verbosity。
    program.hook("preAction", (thisCommand) => {
        const opts = thisCommand.optsWithGlobals();
        if (opts.quiet)
            setCliVerbosity("quiet");
        else if (opts.verbose)
            setCliVerbosity("verbose");
    });
    if (process.argv.length <= 2) {
        if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
            await runCityApp();
            process.exit(0);
        }
        program.outputHelp();
        process.exit(0);
    }
    await program.parseAsync();
}
//# sourceMappingURL=RootCommand.js.map