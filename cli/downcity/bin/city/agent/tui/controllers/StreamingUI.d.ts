/**
 * 流式会话事件控制器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code StreamingUIController 的语义方法：
 *   appendAssistantDelta / onStreamingTextStart / onStreamingTextUpdate / onStreamingTextEnd。
 * - 用 _streaming_block 维护当前 assistant 条目，保证增量只更新同一个组件。
 * - flush 节拍合并高频 text-delta，降低终端重绘开销。
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
    private streaming_block;
    private assistant_draft;
    private pending_assistant_flush;
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
    /**
     * 追加 assistant 文本增量。
     *
     * @param delta 新增文本片段。
     */
    private append_assistant_delta;
    /**
     * 开始一个新的 assistant 流式条目。
     */
    private on_streaming_text_start;
    /**
     * 将当前 draft 刷入组件与条目。
     */
    private flush;
    /**
     * 结束当前 assistant 流式条目。
     */
    private on_streaming_text_end;
    /**
     * 结束当前 assistant 文本块。
     */
    private finalize_assistant;
    private add_tool_call;
    private add_approval_request;
    private add_approval_result;
    private add_error;
    private extract_event_turn_id;
    /**
     * 调度一次重绘。多次调用会被合并到下一个 STREAMING_UI_FLUSH_MS 节拍。
     */
    private schedule_render;
    private clear_flush_timer;
}
//# sourceMappingURL=StreamingUI.d.ts.map