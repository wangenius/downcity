/**
 * 当前 City base 的 admin 工作区入口。
 *
 * 关键说明（中文）
 * - `city` CLI 只负责 admin/base 管理。
 * - user 登录与 user runtime 统一放到 `town city login`。
 */
import { readServer } from "../core/session.js";
import { openServerManagement } from "./ServerManagement.js";
/**
 * 打开某个 server 的 admin 工作区。
 */
export async function openServerWorkspace(base_url) {
    const server = readServer(base_url);
    if (!server) {
        return "home";
    }
    const result = await openServerManagement(server.base_url);
    return result === "quit" ? "quit" : "home";
}
//# sourceMappingURL=ServerWorkspace.js.map