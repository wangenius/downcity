/**
 * 当前 City server 的 admin 管理入口。
 *
 * 关键说明（中文）
 * - `city` CLI 只暴露 admin/base 管理能力。
 * - user 登录与 user runtime 由 `town` 管理。
 */
import { type ServerManagementResult } from "../types/Interactive.js";
/**
 * 打开某个 server 的管理菜单。
 */
export declare function openServerManagement(base_url: string): Promise<ServerManagementResult>;
//# sourceMappingURL=ServerManagement.d.ts.map