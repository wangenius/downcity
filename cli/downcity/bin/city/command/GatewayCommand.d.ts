/**
 * City runtime 命令装配模块。
 *
 * 关键点（中文）
 * - City CLI 不再启动 Console UI 项目；`city start` 只负责本机 runtime。
 * - 旧 gateway 源码暂时保留给历史 API/清理逻辑，但不再挂到用户命令入口。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */
import { Command } from "commander";
import { prepareForegroundAgent, ensureRegisteredAgentProjectRoot } from "../runtime/gateway/runtime/GatewayProcess.js";
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
 * 注册 top-level city 生命周期命令。
 *
 * 语义说明（中文）
 * - `city ...` 管的是本机宿主 runtime 与受管 agent。
 * - Console UI 已从 City 启动链路断开，不再提供 `city console` / `city public` 入口。
 */
export declare function registerGatewayCommands(program: Command, context: GatewayCommandRegistrationContext): void;
export { ensureRegisteredAgentProjectRoot, prepareForegroundAgent, };
//# sourceMappingURL=GatewayCommand.d.ts.map