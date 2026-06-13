/**
 * Town City 连接持久化全屏 TUI。
 *
 * 关键点（中文）
 * - 裸 `town city` 使用这个界面，所有状态、loading 和结果都保留在 TUI 右侧。
 * - `town city status/list/whoami/...` 子命令仍由 shared/CityConnection 负责 stdout 输出。
 * - 需要输入的动作会临时进入现有 prompt TUI，完成后回到本界面并展示结果。
 */
/**
 * 打开 City 连接管理 TUI。
 */
export declare function open_city_manager_tui(): Promise<void>;
//# sourceMappingURL=CityManagerTui.d.ts.map