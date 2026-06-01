/**
 * `town model` 命令组入口。
 *
 * 关键点（中文）
 * - 这里只做命令树装配，不再直接承载 provider/model 业务逻辑。
 * - 具体实现拆分到查询与交互模块，降低单文件复杂度。
 */
import type { Command } from "commander";
/**
 * 注册 `town model` 命令组。
 */
export declare function registerModelCommand(program: Command): void;
//# sourceMappingURL=Model.d.ts.map