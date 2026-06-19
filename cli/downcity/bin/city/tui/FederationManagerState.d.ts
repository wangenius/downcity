/**
 * Federation 管理器状态构建与动作处理。
 *
 * 关键点（中文）
 * - 负责读取当前 Federation 成员资格、构建菜单项、处理用户动作。
 * - 与 TUI 渲染解耦，便于单独测试和后续扩展。
 */
import type { FederationMembershipState, FederationProfile } from "../types/FederationMembership.js";
import type { CityBalanceAccount } from "../types/CityBalance.js";
import type { CityUserSession } from "../types/CitySession.js";
import type { tui_list_item } from "../types/Tui.js";
/** Federation 管理器可选动作。 */
export type city_manager_action = "status" | "use" | "connect" | "list" | "login" | "whoami" | "recharge" | "logout" | "language" | "exit";
/** Federation 管理器状态快照。 */
export interface city_manager_state {
    /** 左侧菜单项。 */
    items: tui_list_item[];
    /** 顶部副标题。 */
    subtitle: string;
    /** 当前 Federation 状态。 */
    membership: FederationMembershipState;
    /** 当前余额摘要。 */
    balance?: CityBalanceAccount | null;
    /** 余额读取错误。 */
    balance_error?: string;
    /** 右侧详情覆盖内容。 */
    detail_override?: string;
    /** 最近一次动作结果。 */
    last_message?: string;
    /** 初始聚焦动作。 */
    initial_action?: city_manager_action;
}
export declare function read_federation_membership_state(): FederationMembershipState;
export declare function save_city_user_session(session: CityUserSession): void;
/**
 * 构建 Federation 管理器状态。
 */
export declare function build_city_manager_state(params?: {
    initial_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
}): Promise<city_manager_state>;
export declare function handle_city_action(params: {
    action: city_manager_action;
    set_detail: (content: string) => void;
    refresh_state: (state?: {
        keep_action?: city_manager_action;
        detail_override?: string;
        last_message?: string;
    }) => Promise<void>;
}): Promise<void>;
export declare function handle_city_prompt_action(action: city_manager_action): Promise<{
    initial_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
}>;
export declare function is_prompt_action(action: city_manager_action): boolean;
export declare function select_federation(server: FederationProfile): void;
export declare function section_item(id: string, title: string): tui_list_item;
//# sourceMappingURL=FederationManagerState.d.ts.map