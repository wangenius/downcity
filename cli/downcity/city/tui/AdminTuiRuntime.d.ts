/**
 * Admin 单屏 TUI Shell 运行时。
 *
 * 关键说明（中文）
 * - Admin 启动后只创建一个 blessed screen，除退出外不再跳出全屏应用模式。
 * - 左侧为稳定导航区，右侧 section 承载 loading、列表、文本、JSON、消息与输入。
 */
import type { admin_tui_runtime } from "../types/AdminTui.js";
/**
 * 创建 admin TUI runtime。
 */
export declare function create_admin_tui_runtime(title?: string): admin_tui_runtime;
//# sourceMappingURL=AdminTuiRuntime.d.ts.map