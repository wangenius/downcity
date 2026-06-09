/**
 * Admin 单屏 TUI Shell 运行时。
 *
 * 关键说明（中文）
 * - Admin 启动后只创建一个 blessed screen，除退出外不再跳出全屏应用模式。
 * - 左侧 sidebar 承载所有菜单层级，右侧 section 只承载 loading、文本、JSON、消息与输入。
 */
import type { admin_tui_runtime } from "../types/AdminTui.js";
/**
 * 创建 admin TUI runtime。
 */
export declare function create_admin_tui_runtime(title?: string): admin_tui_runtime;
//# sourceMappingURL=AdminTuiRuntime.d.ts.map