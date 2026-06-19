#!/usr/bin/env node

/**
 * downfed CLI 根命令装配模块。
 *
 * 关键点（中文）
 * - `downfed` 是 Federation 管理器，负责部署、City 实体、服务资源等 admin 能力。
 * - 默认无参数时打开交互式 Federation 管理界面。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责按命令名分发。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runFederationApp } from "../base/app.js";
import { readPersistedCliLocale } from "../base/core/session.js";
import { createVersionBanner } from "../shared/IndexSupport.js";
import { setCliVerbosity } from "../shared/CliReporter.js";
import { deployFederationProject } from "../base/deploy/commands/deploy.js";
import { createFederationProject } from "../base/create/commands/create.js";
import { refreshEnvCache } from "../base/env/commands/refresh.js";
import { helpText, langOptionText, resolveCliLocale, setCliLocale, t } from "../shared/CliLocale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

/**
 * 执行 downfed CLI。
 */
export async function runDownfedCli(): Promise<void> {
  const program = new Command();
  const argv = process.argv.slice(2);
  const cli_locale = resolveCliLocale({
    argv,
    persisted_locale: readPersistedCliLocale(),
  });
  setCliLocale(cli_locale);

  program
    .name("downfed")
    .description(t({
      zh: "Downcity Federation CLI — 管理 Federation、City 实体与服务资源",
      en: "Downcity Federation CLI — manage Federation, City entities, and service resources",
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
      zh: "打开 Federation 交互式管理界面",
      en: "open the interactive Federation management interface",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(packageJson.version, async (action?: string) => {
      await runFederationApp(action ? [action] : []);
    }));

  program
    .command("create [dir]")
    .description(t({
      zh: "交互式创建 Federation 项目骨架",
      en: "interactively scaffold a Federation project",
    }))
    .option("-f, --force", t({
      zh: "允许覆盖已有项目文件",
      en: "allow overwriting existing project files",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(packageJson.version, async (
      dir: string | undefined,
      options: { force?: boolean },
    ) => {
      await createFederationProject(dir ?? ".", options);
    }));

  program
    .command("deploy [source]")
    .description(t({
      zh: "部署当前目录或本地目录中的 Federation 项目",
      en: "deploy a Federation project from the current directory or a local path",
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
      await deployFederationProject(source ?? ".", options);
    }));

  const env_program = program
    .command("env")
    .description(t({
      zh: "管理当前 Federation 的环境变量运行态能力",
      en: "manage runtime environment capabilities for the current Federation",
    }))
    .helpOption("--help", helpText());

  env_program
    .command("refresh")
    .description(t({
      zh: "刷新当前 Federation runtime env cache",
      en: "refresh the current Federation runtime env cache",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(packageJson.version, async () => {
      await refreshEnvCache();
    }));

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals<{ quiet?: boolean; verbose?: boolean }>();
    if (opts.quiet) setCliVerbosity("quiet");
    else if (opts.verbose) setCliVerbosity("verbose");
  });

  program.showHelpAfterError();
  program.showSuggestionAfterError();

  if (process.argv.length <= 2) {
    await runFederationApp([]);
    process.exit(0);
  }

  await program.parseAsync(process.argv);
}
