/**
 * city agent chat TUI 内部数据类型。
 *
 * 关键点（中文）
 * - 定义消息流中各种展示单元的统一结构。
 * - 与 @downcity/agent 的 SessionMutation 解耦，便于 UI 侧独立渲染与测试。
 */

/**
 * 消息流条目类型联合。
 */
export type TranscriptEntry =
  | UserEntry
  | AssistantEntry
  | ToolCallEntry

  | ToolApprovalRequestEntry
  | ToolApprovalResultEntry
  | StatusEntry
  | ErrorEntry;

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
  /** tool 调用唯一标识，用于关联后续结果。 */
  tool_call_id: string;
  /** tool 名称。 */
  tool_name: string;
  /** tool 参数（JSON 任意类型）。 */
  args: unknown;
  /** tool 执行结果；收到 tool-result 事件后填充。 */
  result?: unknown;
  /**
   * tool 执行状态。
   * - `pending`：已调用，等待结果。
   * - `approval-required`：等待用户审批高风险操作。
   * - `success`：已返回结果。
   * - `error`：执行失败。
   */
  status?: "pending" | "approval-required" | "success" | "error";
  /** 当前工具等待的审批 ID，仅 approval-required 状态存在。 */
  approval_id?: string;
  /** 当前卡片是否展开显示完整结果。 */
  expanded?: boolean;
}

/** Agent Chat 审批面板所需的规范化请求详情。 */
export interface AgentChatApprovalView {
  /** 当前审批所属 Session 标识。 */
  session_id: string;
  /** 稳定审批 ID。 */
  approval_id: string;
  /** 发起审批的工具名称。 */
  tool_name: string;
  /** 待执行命令或输入内容。 */
  cmd: string;
  /** 待执行操作的工作目录。 */
  cwd: string;
  /** 申请 unrestricted 执行的业务原因。 */
  reason: string;
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

  /**
   * 当前 session 可读标题。
   *
   * 关键点（中文）
   * - 由远程 session 的 `AgentSessionInfo.title` 提供。
   * - 标题可能为空，UI 层需回退到占位文案。
   */
  session_title?: string;

  /** 当前 Session 保存的 Federation 模型 ID。 */
  session_model_id?: string;

  /** 当前 Session 模型对应的 Federation 模型名称。 */
  session_model_name?: string;

  /** 是否正在等待助手回复。 */
  is_executing: boolean;

  /** 当前状态栏提示文本。 */
  status_text: string;

  /**
   * Transcript 相对最新内容向上偏移的行数。
   * 0 表示跟随最新消息，大于 0 表示用户正在查看历史。
   */
  transcript_scroll_offset: number;
}
