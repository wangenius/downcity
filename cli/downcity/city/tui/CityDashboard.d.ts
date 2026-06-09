/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `city` / `city manage` 的默认交互入口。
 * - 进入具体动作前会销毁 TUI 屏幕，再复用现有 prompts/clack 流程。
 * - 动作结束后重新回到 TUI，保证迭代速度与既有功能兼容。
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