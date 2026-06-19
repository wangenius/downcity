/**
 * CLI agent 命令装配。
 *
 * 关键点（中文）
 * - 统一承载 `city agent` 命令树，避免主入口继续混合 console 与 agent 两套语义。
 * - 只保留 agent 命令自身的校验与装配，不接管全局 CLI 初始化。
 */
import type { Command, Option } from "commander";
/**
 * agent 命令注册参数。
 */
export interface AgentCommandRegistrationContext {
    /** 当前 CLI 版本号。 */
    version: string;
    /** 当前 city 绑定的 agent runtime 版本号。 */
    agentVersion: string;
    /** commander 的隐藏 Option 构造器。 */
    hiddenPortOption: typeof Option;
}
/**
 * 注册 `city agent` 命令组。
 */
export declare function registerAgentCommands(program: Command, context: AgentCommandRegistrationContext): void;
//# sourceMappingURL=AgentCommand.d.ts.map