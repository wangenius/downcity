/**
 * `city federation` 命令装配模块。
 *
 * 关键点（中文）
 * - 所有 commander 注册逻辑统一放在 `src/command/`。
 * - Federation 成员资格、登录和状态读写由 `shared/FederationConnection` 提供。
 * - `downfed` CLI 负责 Federation 基础设施管理；`city federation` 只负责让本机 City 加入/登录 Federation。
 */
import type { Command } from "commander";
/**
 * 注册 `city federation` 命令组。
 */
export declare function register_federation_command(program: Command): void;
//# sourceMappingURL=FederationCommand.d.ts.map