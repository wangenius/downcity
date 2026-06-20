/**
 * 流式会话事件控制器。
 *
 * 关键点（中文）
 * - 把 @downcity/agent 的 AgentSessionEvent 映射为消息流条目。
 * - 维护当前 turn id，保证跨事件状态一致。
 * - 所有状态变更最终反映到 MessageListComponent。
 */
import type { AgentSessionEvent } from "@downcity/agent";
import type { MessageListComponent } from "../../../../city/agent/tui/components/MessageList.js";
/**
 * StreamingUIController 构造选项。
 */
export interface StreamingUIOptions {
    /** 消息流组件。 */
    message_list: MessageListComponent;
    /** TUI 请求重绘回调。流式 delta、tool 事件、结束都会调用。 */
    request_render: () => void;
}
/**
 * 流式 UI 控制器。
 */
export declare class StreamingUIController {
    private message_list;
    private request_render_fn;
    private active_turn_id;
    private current_assistant_entry_id;
    private current_assistant_text;
    private flush_timer;
    private last_flush_at;
    private pending_render;
    /**
     * @param options 构造选项。
     */
    constructor(options: StreamingUIOptions);
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
     * 处理单个 session 事件。
     *
     * @param event AgentSessionEvent。
     */
    handle_event(event: AgentSessionEvent): void;
    /**
     * 结束当前一轮渲染。
     */
    finish_turn(): void;
    private extract_event_turn_id;
    private create_assistant_entry;
    private append_assistant_text;
    private finalize_assistant;
    private add_tool_call;
    private add_tool_result;
    private add_approval_request;
    private add_approval_result;
    private add_error;
    /**
     * 调度一次重绘。多次调用会被合并到下一个 STREAMING_UI_FLUSH_MS 节拍。
     */
    private schedule_render;
    /**
     * 立刻触发一次重绘，并重置节流计时。
     */
    private flush_now;
    private clear_flush_timer;
}
//# sourceMappingURL=StreamingUI.d.ts.map