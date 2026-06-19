/**
 * city agent chat TUI 内部数据类型。
 *
 * 关键点（中文）
 * - 定义消息流中各种展示单元的统一结构。
 * - 与 @downcity/agent 的 AgentSessionEvent 解耦，便于 UI 侧独立渲染与测试。
 */
/**
 * 消息流条目类型联合。
 */
export type TranscriptEntry = UserEntry | AssistantEntry | ToolCallEntry | ToolResultEntry | ToolApprovalRequestEntry | ToolApprovalResultEntry | StatusEntry | ErrorEntry;
/**
 * 基础条目字段。
 */
interface BaseEntry {
    /** 条目唯一标识，用于列表 key。 */
    id: string;
    /** 条目创建时间戳（ms）。 */
    created_at: number;
}
/**
 * 用户发送的消息。
 */
export interface UserEntry extends BaseEntry {
    kind: "user";
    /** 用户输入文本。 */
    text: string;
}
/**
 * 助手回复的消息。
 */
export interface AssistantEntry extends BaseEntry {
    kind: "assistant";
    /** 助手文本，流式过程中会不断更新。 */
    text: string;
    /** 是否仍在流式输出中。 */
    streaming: boolean;
}
/**
 * tool 调用记录。
 */
export interface ToolCallEntry extends BaseEntry {
    kind: "tool-call";
    /** tool 名称。 */
    tool_name: string;
    /** tool 参数（JSON 任意类型）。 */
    args: unknown;
}
/**
 * tool 执行结果记录。
 */
export interface ToolResultEntry extends BaseEntry {
    kind: "tool-result";
    /** tool 名称。 */
    tool_name: string;
    /** tool 结果（JSON 任意类型）。 */
    result: unknown;
}
/**
 * 需要人工审批的 sandbox 请求。
 */
export interface ToolApprovalRequestEntry extends BaseEntry {
    kind: "tool-approval-request";
    /** 审批 ID。 */
    approval_id: string;
    /** tool 名称。 */
    tool_name: string;
    /** 操作类型：write / exec。 */
    operation: string;
    /** 执行的命令或输入预览。 */
    command_value: string;
    /** 工作目录。 */
    cwd: string;
    /** 申请理由。 */
    reason: string;
}
/**
 * 审批结果记录。
 */
export interface ToolApprovalResultEntry extends BaseEntry {
    kind: "tool-approval-result";
    /** 审批 ID。 */
    approval_id: string;
    /** tool 名称。 */
    tool_name: string;
    /** 审批决定：approved / denied。 */
    decision: string;
}
/**
 * 状态提示消息。
 */
export interface StatusEntry extends BaseEntry {
    kind: "status";
    /** 状态文本。 */
    text: string;
}
/**
 * 错误提示消息。
 */
export interface ErrorEntry extends BaseEntry {
    kind: "error";
    /** 错误文本。 */
    text: string;
}
/**
 * TUI 应用状态。
 */
export interface AppState {
    /** 当前 agent id。 */
    agent_id: string;
    /** 当前 session id。 */
    session_id: string;
    /** 是否正在等待助手回复。 */
    is_executing: boolean;
    /** 当前状态栏提示文本。 */
    status_text: string;
}
export {};
//# sourceMappingURL=types.d.ts.map