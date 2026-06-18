/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `city` / `city manage` 的默认交互入口。
 * - 左侧 sidebar 承载 City 列表与 breadcrumb，右侧 main_section 展示当前项详情。
 */
import type { HomeAction, WelcomeAction } from "../types/Interactive.js";
import type { tui_action_result } from "../types/Tui.js";
interface city_dashboard_options {
    /** 执行欢迎页动作。 */
    run_welcome_action: (action: WelcomeAction) => Promise<tui_action_result>;
    /** 执行首页动作。 */
    run_home_action: (action: HomeAction) => Promise<tui_action_result>;
}
/**
 * 打开 City 顶层仪表盘。
 */
export declare function open_city_dashboard(options: city_dashboard_options): Promise<void>;
export {};
//# sourceMappingURL=CityDashboard.d.ts.map