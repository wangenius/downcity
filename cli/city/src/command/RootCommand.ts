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
import { createVersionBanner } from "../shared/IndexSupport.js";
import { setCliVerbosity } from "../shared/CliReporter.js";
import { deployCityProject } from "../deploy/commands/deploy.js";
import { createCityProject } from "../create/commands/create.js";
import { refreshEnvCache } from "../env/commands/refresh.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

/**
 * 执行 City CLI。
 */
export async function runCityCli(): Promise<void> {
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
      await runCityApp(action ? [action] : []);
    }));

  program
    .command("create [dir]")
    .description("交互式创建 City 项目骨架")
    .option("-f, --force", "允许覆盖已有项目文件")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(packageJson.version, async (
      dir: string | undefined,
      options: { force?: boolean },
    ) => {
      await createCityProject(dir ?? ".", options);
    }));

  program
    .command("deploy [source]")
    .description("部署当前目录或本地目录中的 City 项目")
    .option("--dry-run", "只执行 Wrangler dry-run，不发布 Worker")
    .option("--verify", "部署完成后请求 Worker /health")
    .option("--verify-only", "只请求 Worker /health，不构建或部署")
    .option("--skip-build", "跳过 package.json 中的 build")
    .option("--skip-typecheck", "跳过 package.json 中的 typecheck")
    .option("--account-id <account_id>", "本次部署使用的 Cloudflare account id")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(packageJson.version, async (
      source: string | undefined,
      options: {
        dryRun?: boolean;
        verify?: boolean;
        verifyOnly?: boolean;
        skipBuild?: boolean;
        skipTypecheck?: boolean;
        accountId?: string;
      },
    ) => {
      await deployCityProject(source ?? ".", options);
    }));

  const env_program = program
    .command("env")
    .description("管理当前 City 的环境变量运行态能力")
    .helpOption("--help", "display help for command");

  env_program
    .command("refresh")
    .description("刷新当前 City runtime env cache")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(packageJson.version, async () => {
      await refreshEnvCache();
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
      await runCityApp();
      process.exit(0);
    }
    program.outputHelp();
    process.exit(0);
  }

  await program.parseAsync();
}
