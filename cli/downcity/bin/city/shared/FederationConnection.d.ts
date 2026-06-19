/**
 * City 与 Federation 成员资格管理服务。
 *
 * 关键点（中文）
 * - `city` CLI 作为本机 Agent 宿主，通过 Federation 访问共享资源。
 * - 本模块维护 City 加入的 Federation、登录态与本地 profile。
 * - City 只读发现 `downfed` admin 配置的 Federation，但不依赖其内部模块。
 * - CLI 命令装配统一放在 `src/command/FederationCommand.ts`，本模块只保留状态与登录流程。
 */
import type { FederationMembershipState } from "../types/FederationMembership.js";
export declare function read_city_admin_secret_for_federation(federation_url: string): string | undefined;
export declare function read_federation_membership_state(): FederationMembershipState;
export declare function emit_federation_status(options?: {
    as_json?: boolean;
}): void;
export declare function emitCityUserWhoami(options?: {
    as_json?: boolean;
}): Promise<void>;
export declare function emit_federation_list(options?: {
    as_json?: boolean;
}): void;
export declare function run_federation_join_command(params: {
    url?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function run_federation_use_command(params: {
    server?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function run_federation_login_command(params: {
    url?: string;
    city_id?: string;
    as_json?: boolean;
}): Promise<void>;
export declare function run_federation_logout_command(options?: {
    as_json?: boolean;
}): void;
export declare function run_federation_leave_command(options?: {
    as_json?: boolean;
}): void;
export declare function run_interactive_federation_manager(): Promise<void>;
//# sourceMappingURL=FederationConnection.d.ts.map