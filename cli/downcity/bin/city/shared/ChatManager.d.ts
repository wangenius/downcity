/**
 * `city chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `city chat` 进入 chat plugin 共享资源管理，而不是只输出静态 help。
 * - chat account 属于 City 级共享资源，供各 agent 的 chat plugin 选择绑定。
 * - 访问控制属于 chat plugin 的 access 能力，不再作为独立 plugin 心智暴露。
 * - City 不管理 chat plugin 运行态；运行态由具体 agent 内部托管。
 */
/**
 * 运行 `city chat` 交互式管理器。
 */
export declare function runInteractiveChatManager(): Promise<void>;
//# sourceMappingURL=ChatManager.d.ts.map