/**
 * Federation 管理器交互式 prompts。
 *
 * 关键点（中文）
 * - 负责收集 Federation URL、选择 Federation、充值输入等。
 * - 与 TUI 状态解耦，便于复用和单独测试。
 */
import type { FederationProfile } from "../types/FederationMembership.js";
export declare function prompt_city_url(): Promise<string | null>;
export declare function prompt_federation(): Promise<FederationProfile | null>;
export declare function prompt_recharge_input(): Promise<{
    amount: number;
    method_id?: string;
    note?: string;
    open_checkout?: boolean;
} | null>;
//# sourceMappingURL=FederationManagerPrompts.d.ts.map