/**
 * `town model` 查询与绑定命令。
 *
 * 关键点（中文）
 * - 这里只处理不修改平台模型池状态的命令。
 * - `use` 虽然会写项目配置，但不会改动 console store，因此也归在这里。
 */
import type { Command } from "commander";
/**
 * 注册 `list/get/discover/use` 命令。
 */
export declare function registerModelReadCommands(model: Command): void;
//# sourceMappingURL=ModelReadCommand.d.ts.map