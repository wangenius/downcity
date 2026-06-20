/**
 * `city agent chat` 命令辅助函数。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 * - 远程访问统一走 `RemoteAgent({ url })`，不再在 CLI 侧维护第二套 HTTP SDK transport。
 * - 远程连接、session 创建/列表等操作委托给 `AgentChatRemote.ts`。
 */
import { RemoteAgent } from "@downcity/agent";
import type { AgentChatCliOptions, AgentChatExecutionOutcome, AgentChatSessionOptions } from "../../city/agent/AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "../../city/types/AgentChatInteractive.js";
export type ResolvedAgentChatTarget = {
    /** 目标 agent id。 */
    agentId: string;
    /** 目标项目根目录。 */
    projectRoot: string;
    /** 当前 chat 绑定的 sessionId。 */
    sessionId: string;
    /** 当前 chat 是否要求创建全新的 session。 */
    createNewSession: boolean;
};
export declare function normalizeChatMessage(input: string): string;
/**
 * 解析 `city agent chat` 的 session 选择语义。
 *
 * 关键点（中文）
 * - 默认继续使用 `local-cli-chat-main`，保持老命令行为稳定。
 * - `--new-session` 生成不可预测的新 ID，避免用户手动清理旧上下文。
 * - `--session-id` 与 `--new-session` 互斥，避免“复用”和“新建”语义冲突。
 */
export declare function resolveAgentChatSessionOptions(input?: AgentChatSessionOptions): {
    success: true;
    session_id: string;
    create_new_session: boolean;
} | {
    success: false;
    error: string;
};
export declare function hasExplicitSessionSelection(input: AgentChatSessionOptions): boolean;
export declare function resolveChatTargetAgentId(inputId?: string): Promise<string | null>;
export declare function resolveAgentChatTarget(agentIdInput: string, sessionOptions?: AgentChatSessionOptions): Promise<{
    success: true;
    target: ResolvedAgentChatTarget;
} | {
    success: false;
    outcome: AgentChatExecutionOutcome;
}>;
export declare function printAssistantReply(replyText: string): void;
export declare function printAgentChatFailure(params: {
    agentId: string;
    error?: string;
}): void;
export declare function resolveInteractiveChatSession(params: {
    agentId: string;
    options: AgentChatCliOptions;
    transport?: {
        host?: string;
        port?: number;
    };
}): Promise<{
    success: true;
    target: ResolvedAgentChatTarget;
    remote_agent: RemoteAgent;
    show_initial_picker: boolean;
} | {
    success: false;
    error?: string;
}>;
export declare function runSdkPromptTurn(params: {
    agentId: string;
    message: string;
    sessionOptions?: AgentChatSessionOptions;
    transport?: {
        host?: string;
        port?: number;
    };
    renderText?: boolean;
    interactiveRenderer?: AgentChatInteractiveRendererPort;
}): Promise<{
    success: boolean;
    error?: string;
    emittedVisibleText: boolean;
    sessionId: string;
    projectRoot?: string;
    text?: string;
}>;
/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export declare function executeAgentChatTurn(params: {
    agentId: string;
    message: string;
    sessionOptions?: AgentChatSessionOptions;
    transport?: {
        host?: string;
        port?: number;
    };
}): Promise<AgentChatExecutionOutcome>;
export declare function runOneShotChat(params: {
    agentId: string;
    message: string;
    options: AgentChatCliOptions;
}): Promise<void>;
//# sourceMappingURL=AgentChatHelpers.d.ts.map