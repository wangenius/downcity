/**
 * `town model create` 交互命令。
 *
 * 关键点（中文）
 * - `create` 是 model 命令组里“直接进入创建流程”的快捷入口。
 * - provider 创建后可立即测试并批量导入发现到的远端模型。
 * - 模型创建支持两种方式：手动输入 或 从 Provider 发现并多选创建。
 */
import type { Command } from "commander";
/**
 * 运行 `town model create` 交互流程。
 *
 * 关键点（中文）
 * - 既供 `town model create` 直接调用，也供裸 `town model` manager 复用。
 */
export declare function runInteractiveModelCreateFlow(options: {
    json?: boolean;
}): Promise<void>;
/**
 * 注册 `town model create` 交互命令。
 */
export declare function registerModelCreateCommand(model: Command): void;
//# sourceMappingURL=ModelCreateCommand.d.ts.map