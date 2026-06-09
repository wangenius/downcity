/**
 * Town 顶层全屏 TUI 仪表盘。
 *
 * 关键点（中文）
 * - 这是裸 `town` 的默认入口。
 * - 进入具体动作前销毁 TUI，再复用现有命令/交互流程。
 * - 动作结束后返回仪表盘，形成统一终端操作台体验。
 */
import type { tui_action_result } from "../types/Tui.js";
type town_home_action = "status" | "start" | "stop" | "restart" | "city" | "agent" | "plugin" | "language" | "help" | "exit";
interface town_dashboard_options {
    /** 执行顶层动作。 */
    run_action: (action: town_home_action) => Promise<tui_action_result>;
}
/**
 * 打开 Town 顶层仪表盘。
 */
export declare function open_town_dashboard(options: town_dashboard_options): Promise<void>;
export {};
//# sourceMappingURL=TownDashboard.d.ts.map