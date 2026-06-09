/**
 * 当前 City base 的 admin 工作区入口。
 *
 * 关键说明（中文）
 * - 点开某个 City 后直接进入 admin 管理，不再先展示“打开/配置 admin”中间菜单。
 * - 缺少或失效 admin key 时，才即时弹出 admin_secret_key 输入。
 * - 编辑 City、移除 City、更新 admin 访问统一收进 admin 菜单的“更多”。
 */
/**
 * 打开某个 server 的 admin 工作区。
 */
export declare function openServerWorkspace(base_url: string): Promise<"home" | "quit">;
//# sourceMappingURL=ServerWorkspace.d.ts.map