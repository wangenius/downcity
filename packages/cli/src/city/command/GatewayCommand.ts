/**
 * City 全局命令装配模块。
 *
 * 关键点（中文）
 * - City 根命令只保留一次性全局初始化、配置、env、token 与 federation 管理能力。
 * - Agent 生命周期统一收敛到 `city agent ...`，不再提供 top-level `city start/stop/restart/status`。
 */

import { Command } from "commander";
import { registerConfigCommand } from "@/city/command/ConfigCommand.js";
import { registerEnvCommand } from "@/city/command/EnvCommand.js";
import { registerTokenCommand } from "@/city/command/TokenCommand.js";
import { register_federation_command } from "@/city/command/FederationCommand.js";
import { gatewayInitCommand } from "@/city/runtime/gateway/runtime/GatewayInit.js";
import { createVersionBanner } from "@/shared/IndexSupport.js";
import { CliError } from "@/shared/CliError.js";
import { updateCommand } from "@/city/shared/Update.js";
import { helpText, t } from "@/shared/CliLocale.js";

/**
 * top-level city/gateway 命令注册参数。
 */
export interface GatewayCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** 当前 CLI 入口文件绝对路径。 */
  cliPath: string;
}

/**
 * 注册 top-level city 全局命令。
 *
 * 语义说明（中文）
 * - `city ...` 管一次性全局配置与 Federation 连接。
 * - 需要长期运行的是具体 Agent daemon，由 `city agent start/stop/restart/status` 管理。
 */
export function registerGatewayCommands(
  program: Command,
  context: GatewayCommandRegistrationContext,
): void {
  program
    .command("init")
    .description(t({
      zh: "初始化 City 全局配置（插件、env、账号等，写入 ~/.downcity/downcity.db）",
      en: "initialize City global state (plugins, env, accounts, etc.) in ~/.downcity/downcity.db",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await gatewayInitCommand();
    }));

  program
    .command("update")
    .description(t({
      zh: "更新全局 downcity CLI 到最新版本",
      en: "update the global downcity CLI to the latest version",
    }))
    .option("--manager <manager>", t({
      zh: "指定包管理器（npm|pnpm|auto）",
      en: "choose the package manager (npm|pnpm|auto)",
    }), "auto")
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async (
      _options: { manager?: string },
      command: Command,
    ) => {
      const options = command.opts<{ manager?: string }>();
      const manager = String(options.manager || "auto").trim().toLowerCase();
      if (manager !== "auto" && manager !== "npm" && manager !== "pnpm") {
        throw new CliError({
          title: `Invalid manager: ${manager}`,
          fix: "Use npm|pnpm|auto.",
        });
      }
      await updateCommand({
        manager: manager as "auto" | "npm" | "pnpm",
      });
    }));

  registerConfigCommand(program);
  registerEnvCommand(program);
  registerTokenCommand(program);
  register_federation_command(program);
}
