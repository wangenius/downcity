/**
 * 基于 pi-tui 的交互式 chat 渲染器。
 *
 * 关键点（中文）
 * - 实现 AgentChatInteractiveRendererPort，接入 AgentChat 的 runSdkPromptTurn。
 * - 把 SDK 事件转交给 StreamingUIController，驱动消息流更新。
 */
import type { AgentSessionEvent } from "@downcity/agent";
import type { AgentChatInteractiveRenderSnapshot, AgentChatInteractiveRendererPort } from "../../../city/types/AgentChatInteractive.js";
import type { MessageListComponent } from "../../../city/agent/tui/components/MessageList.js";
/**
 * pi-tui 版交互式渲染器。
 */
export declare class PiTuiChatRenderer implements AgentChatInteractiveRendererPort {
    private streaming_ui;
    private emitted_visible_text;
    /**
     * @param message_list 消息流组件。
     * @param request_render 通知 TUI 重绘的回调。
     */
    constructor(message_list: MessageListComponent, request_render: () => void);
    /**
     * 启动新一轮渲染。
     */
    start_turn(): void;
    /**
     * 绑定当前 turn id。
     *
     * @param turn_id turn id。
     */
    attach_turn_id(turn_id: string): void;
    /**
     * 渲染单个 session 事件。
     *
     * @param event AgentSessionEvent。
     */
    render_event(event: AgentSessionEvent): void;
    /**
     * 结束当前一轮渲染。
     *
     * @returns 渲染结果快照。
     */
    finish_turn(): AgentChatInteractiveRenderSnapshot;
}
//# sourceMappingURL=PiTuiChatRenderer.d.ts.map