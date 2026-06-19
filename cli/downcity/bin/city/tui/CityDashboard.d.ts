/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键点（中文）
 * - 这是裸 `city` 的默认入口。
 * - 左侧 sidebar 承载动作菜单与 breadcrumb，右侧 main_section 展示当前动作说明。
 * - 动作结束后返回仪表盘，形成统一终端操作台体验。
 */
import type { tui_action_result } from "../types/Tui.js";
type city_home_action = "stop" | "restart" | "federation" | "agent" | "plugin" | "language" | "help" | "exit";
interface city_dashboard_options {
    /** 执行顶层动作。 */
    run_action: (action: city_home_action) => Promise<tui_action_result>;
}
/**
 * 打开 City 顶层仪表盘。
 */
export declare function open_city_dashboard(options: city_dashboard_options): Promise<void>;
export {};
//# sourceMappingURL=CityDashboard.d.ts.map