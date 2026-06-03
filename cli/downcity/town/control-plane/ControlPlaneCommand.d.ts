/**
 * CLI town/control-plane 命令装配。
 *
 * 关键点（中文）
 * - 这里的 `console` 更接近 Town gateway / control plane 的运维入口，而不是单 agent API。
 * - 统一管理 top-level town 生命周期命令与 control plane 模块命令。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */
import { Command } from "commander";
import { prepareForegroundAgent, ensureRegisteredAgentProjectRoot } from "./ControlPlaneProcess.js";
/**
 * top-level town/control-plane 命令注册参数。
 */
export interface ControlPlaneCommandRegistrationContext {
    /** 当前 CLI 版本号。 */
    version: string;
    /** 当前 CLI 入口文件绝对路径。 */
    cliPath: string;
}
/**
 * 注册 top-level town 生命周期命令与 `console` 模块命令。
 *
 * 语义说明（中文）
 * - `town ...` / `town console ...` 管的是本机宿主与平台控制面进程。
 * - 单 agent 控制能力统一由 Town 基于 Agent runtime / RPC 装配外层协议面。
 */
export declare function registerControlPlaneCommands(program: Command, context: ControlPlaneCommandRegistrationContext): void;
export { ensureRegisteredAgentProjectRoot, prepareForegroundAgent, };
//# sourceMappingURL=ControlPlaneCommand.d.ts.map