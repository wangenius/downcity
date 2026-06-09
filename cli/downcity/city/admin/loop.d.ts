/**
 * Admin 命令循环。
 *
 * 关键说明（中文）
 * - embedded 模式用于 user 工作区下的 server management
 * - 此时 admin 只作为低频管理工具，不再承担顶层导航职责
 */
import { type AdminSession } from "../core/session.js";
export declare function adminLoop(session: AdminSession, options?: {
    embedded?: boolean;
}): Promise<"logout" | "quit" | "switch_identity" | "back">;
//# sourceMappingURL=loop.d.ts.map