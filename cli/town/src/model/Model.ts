/**
 * `town model` 命令组入口。
 *
 * 关键点（中文）
 * - 这里只做命令树装配，不再直接承载 provider/model 业务逻辑。
 * - 具体实现拆分到查询与交互模块，降低单文件复杂度。
 */

import type { Command } from "commander";
import { runInteractiveModelManager } from "./ModelManager.js";
import { registerModelReadCommands } from "./ModelReadCommand.js";

/**
 * 注册 `town model` 命令组。
 */
export function registerModelCommand(program: Command): void {
  const model = program
    .command("model")
    .description("查看和绑定 City AIService 模型（无参数时启动交互式绑定器）")
    .helpOption("--help", "display help for command")
    .action(async () => {
      if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
        await runInteractiveModelManager();
        return;
      }
      model.outputHelp();
    });

  registerModelReadCommands(model);
}
