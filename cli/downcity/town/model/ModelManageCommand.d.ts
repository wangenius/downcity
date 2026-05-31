/**
 * `town model` 写入与测试命令。
 *
 * 关键点（中文）
 * - 统一承载 add/pause/remove/update/test 这类会写 console store 或依赖实际调用的命令。
 * - 通过共享工具模块复用参数解析与错误输出逻辑。
 */
import type { Command } from "commander";
/**
 * 注册 `add/pause/remove/update/test` 命令。
 */
export declare function registerModelManageCommands(model: Command): void;
//# sourceMappingURL=ModelManageCommand.d.ts.map