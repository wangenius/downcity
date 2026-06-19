/**
 * Federation 管理器文本格式化函数。
 *
 * 关键点（中文）
 * - 负责 membership、列表、登录、余额、充值等详情渲染。
 * - 纯函数，不依赖 blessed 状态。
 */
import { CityUserManager } from "../shared/CityUserManager.js";
import type { city_manager_state } from "./FederationManagerState.js";
import type { FederationMembershipState, FederationProfile } from "../types/FederationMembership.js";
import type { CityBalanceAccount, CityRechargeResult } from "../types/CityBalance.js";
import type { tui_list_item } from "../types/Tui.js";
export declare function is_disabled_item(item: tui_list_item | undefined): boolean;
export declare function format_header(state: city_manager_state): string;
export declare function format_city_item_label(item: tui_list_item): string;
export declare function format_city_detail(item: tui_list_item | undefined): string;
export declare function format_footer(item: tui_list_item | undefined): string;
export declare function build_city_subtitle(membership: FederationMembershipState, balance: CityBalanceAccount | null): string;
export declare function format_membership_detail(membership: FederationMembershipState): string;
export declare function format_federation_list_detail(servers: FederationProfile[]): string;
export declare function format_login_detail(membership: FederationMembershipState): string;
export declare function format_balance_detail(account: CityBalanceAccount): string;
export declare function format_current_user_detail(user: Awaited<ReturnType<CityUserManager["resolveCurrentUser"]>>): string;
export declare function format_session_detail(session: {
    federation_url: string;
    city_id: string;
    user_id?: string;
    user_label?: string;
    updated_at: string;
}): string;
export declare function format_recharge_result(result: CityRechargeResult): string;
export declare function format_error_detail(title: string, message?: string): string;
export declare function loading_text(message: string): string;
export declare function format_locale_description(cli_locale: "zh" | "en"): string;
//# sourceMappingURL=FederationManagerFormat.d.ts.map