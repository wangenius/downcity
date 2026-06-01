/**
 * `town model` 查询、测试与绑定命令。
 *
 * 关键点（中文）
 * - Town 不再管理模型池。
 * - `town model list` 读取 City AIService 暴露的模型目录。
 * - `town model use` 只把 City AIService 的 model id 写入项目配置。
 */
import type { Command } from "commander";
/**
 * 注册 `list/use/test` 命令。
 */
export declare function registerModelReadCommands(model: Command): void;
//# sourceMappingURL=ModelReadCommand.d.ts.map