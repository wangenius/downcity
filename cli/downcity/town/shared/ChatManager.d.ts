/**
 * `town chat` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town chat` 进入 chat plugin 管理，而不是只输出静态 help。
 * - chat channel account 属于 Town 级配置，在这里通过“配置 channel”管理。
 * - agent 只绑定 channel account，不在 agent 流程中维护密钥。
 */
/**
 * 运行 `town chat` 交互式管理器。
 */
export declare function runInteractiveChatManager(): Promise<void>;
//# sourceMappingURL=ChatManager.d.ts.map