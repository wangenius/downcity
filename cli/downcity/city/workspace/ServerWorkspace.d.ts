/**
 * 当前 City base 的 admin 工作区入口。
 *
 * 关键说明（中文）
 * - `city` CLI 只负责 admin/base 管理。
 * - user 登录与 user runtime 统一放到 `town city login`。
 */
/**
 * 打开某个 server 的 admin 工作区。
 */
export declare function openServerWorkspace(base_url: string): Promise<"home" | "quit">;
//# sourceMappingURL=ServerWorkspace.d.ts.map