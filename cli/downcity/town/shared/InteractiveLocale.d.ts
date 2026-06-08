/**
 * Town 交互式语言设置模块。
 *
 * 关键点（中文）
 * - 统一承载 `town` 交互菜单中的语言选择逻辑，避免首页与 City 管理器重复实现。
 * - 写入 Town 本地状态后立即更新进程内语言，保证后续菜单即时生效。
 */
/**
 * 交互式切换并持久化 Town CLI 语言。
 */
export declare function promptAndPersistTownCliLocale(): Promise<void>;
//# sourceMappingURL=InteractiveLocale.d.ts.map