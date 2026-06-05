/**
 * `town chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town chat` 进入 chat plugin 管理，而不是只输出静态 help。
 * - chat account 属于 Town 级共享资源，供各 agent 的 chat plugin 选择绑定。
 * - 访问控制属于 chat plugin 的 access 能力，不再作为独立 plugin 心智暴露。
 */
/**
 * 运行 `town chat` 交互式管理器。
 */
export declare function runInteractiveChatManager(): Promise<void>;
//# sourceMappingURL=ChatManager.d.ts.map