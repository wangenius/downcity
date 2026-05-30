/**
 * `studio model` 命令组入口。
 *
 * 关键点（中文）
 * - 这里只做命令树装配，不再直接承载 provider/model 业务逻辑。
 * - 具体实现拆分到 create/read/manage 子模块，降低单文件复杂度。
 */

import type { Command } from "commander";
import { runInteractiveModelManager } from "./ModelManager.js";
import { registerModelCreateCommand } from "./ModelCreateCommand.js";
import { registerModelManageCommands } from "./ModelManageCommand.js";
import { registerModelReadCommands } from "./ModelReadCommand.js";

/**
 * 注册 `studio model` 命令组。
 */
export function registerModelCommand(program: Command): void {
  const model = program
    .command("model")
    .description("管理 Studio 全局语言模型池（无参数时启动交互式管理器）")
    .helpOption("--help", "display help for command")
    .action(async () => {
      if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
        await runInteractiveModelManager();
        return;
      }
      model.outputHelp();
    });

  registerModelCreateCommand(model);
  registerModelReadCommands(model);
  registerModelManageCommands(model);
}
