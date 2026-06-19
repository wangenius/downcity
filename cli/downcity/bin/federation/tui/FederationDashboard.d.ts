/**
 * Federation 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `downfed` / `downfed manage` 的默认交互入口。
 * - 左侧 sidebar 承载 Federation 操作菜单，右侧 main_section 展示当前项详情。
 */
import type { FederationAction } from "../types/Interactive.js";
import type { tui_action_result } from "../types/Tui.js";
interface federation_dashboard_options {
    /** 执行 Federation 仪表盘动作。 */
    run_action: (action: FederationAction) => Promise<tui_action_result>;
}
/**
 * 打开 Federation 顶层仪表盘。
 */
export declare function open_federation_dashboard(options: federation_dashboard_options): Promise<void>;
export {};
//# sourceMappingURL=FederationDashboard.d.ts.map