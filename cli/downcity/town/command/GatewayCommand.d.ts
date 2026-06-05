/**
 * Town runtime 命令装配模块。
 *
 * 关键点（中文）
 * - Town CLI 不再启动 Console UI 项目；`town start` 只负责本机 runtime。
 * - 旧 gateway 源码暂时保留给历史 API/清理逻辑，但不再挂到用户命令入口。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */
import { Command } from "commander";
import { prepareForegroundAgent, ensureRegisteredAgentProjectRoot } from "../town/gateway/runtime/GatewayProcess.js";
/**
 * top-level town/gateway 命令注册参数。
 */
export interface GatewayCommandRegistrationContext {
    /** 当前 CLI 版本号。 */
    version: string;
    /** 当前 CLI 入口文件绝对路径。 */
    cliPath: string;
}
/**
 * 注册 top-level town 生命周期命令。
 *
 * 语义说明（中文）
 * - `town ...` 管的是本机宿主 runtime 与受管 agent。
 * - Console UI 已从 Town 启动链路断开，不再提供 `town console` / `town public` 入口。
 */
export declare function registerGatewayCommands(program: Command, context: GatewayCommandRegistrationContext): void;
export { ensureRegisteredAgentProjectRoot, prepareForegroundAgent, };
//# sourceMappingURL=GatewayCommand.d.ts.map