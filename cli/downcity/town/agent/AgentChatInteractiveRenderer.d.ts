/**
 * `town agent chat` 交互式终端渲染器。
 *
 * 职责说明（中文）
 * - 只服务于交互式 `town agent chat`，不参与 `--message` 一次性输出。
 * - 负责 spinner 生命周期、tool 事件可见性，以及 assistant 文本流式渲染。
 * - 把“终端展示状态机”从主命令流程中拆出，降低 `AgentChat.ts` 复杂度。
 */
import type { AgentSessionEvent } from "@downcity/agent";
import type { AgentChatInteractiveRenderSnapshot } from "@/types/AgentChatInteractive.js";
/**
 * 交互式单轮渲染器。
 */
export declare class AgentChatInteractiveRenderer {
    private spinner;
    private spinner_text;
    private emitted_visible_text;
    private text_stream_open;
    private has_block_output;
    private active_turn_id;
    private readonly spinner_enabled;
    constructor();
    /**
     * 启动新一轮交互渲染。
     */
    start_turn(): void;
    /**
     * 绑定当前 turn id。
     */
    attach_turn_id(turn_id: string): void;
    /**
     * 渲染单个 session 事件。
     */
    render_event(event: AgentSessionEvent): void;
    /**
     * 结束当前一轮渲染，补齐末尾换行。
     */
    finish_turn(): AgentChatInteractiveRenderSnapshot;
    private set_spinner_text;
    private stop_spinner;
    private print_text_delta;
    private print_tool_block;
}
//# sourceMappingURL=AgentChatInteractiveRenderer.d.ts.map