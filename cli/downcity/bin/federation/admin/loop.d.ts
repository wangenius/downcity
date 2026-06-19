/**
 * Admin 命令循环。
 *
 * 关键说明（中文）
 * - `city` 点开某个 City 后直接进入这个菜单。
 * - City 连接配置、admin key 更新等低频操作通过 `更多` 回调交给 workspace 层处理。
 */
import { type AdminSession } from "../core/session.js";
import type { admin_tui_runtime } from "../types/AdminTui.js";
export declare function adminLoop(session: AdminSession, options?: {
    embedded?: boolean;
    title?: string;
    on_more?: (runtime: admin_tui_runtime) => Promise<"continue" | "back" | "quit" | "removed">;
    runtime?: admin_tui_runtime;
}): Promise<"logout" | "quit" | "switch_identity" | "back">;
//# sourceMappingURL=loop.d.ts.map