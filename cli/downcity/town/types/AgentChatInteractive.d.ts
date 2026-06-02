/**
 * `town agent chat` 交互式渲染相关类型。
 *
 * 职责说明（中文）
 * - 统一承接交互式 chat 的终端展示快照与 tool 区块类型。
 * - 保持类型集中在 `types/` 目录，便于后续扩展与跨模块复用。
 */
/**
 * 交互式 chat 渲染结果快照。
 */
export interface AgentChatInteractiveRenderSnapshot {
    /** 是否输出过面向用户可见的 assistant 文本。 */
    emitted_visible_text: boolean;
}
/**
 * tool 展示区块。
 */
export interface AgentChatToolDisplayBlock {
    /** tool 状态标题。 */
    title: string;
    /** tool 详细摘要行。 */
    detail_lines: string[];
}
//# sourceMappingURL=AgentChatInteractive.d.ts.map