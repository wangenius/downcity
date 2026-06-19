/**
 * Agent Chat 远程连接与会话管理模块。
 *
 * 关键点（中文）
 * - 封装 `RemoteAgent` 创建、session 列表、session 创建/获取等远程操作。
 * - 不处理命令行交互与本地 agent 解析，只负责与 daemon RPC 的通信侧逻辑。
 */
import { RemoteAgent, type AgentSessionSummary, type RemoteAgentSession } from "@downcity/agent";
import { type AgentChatSessionSummaryView, type AgentChatTransportOptions } from "./AgentChatTypes.js";
/**
 * 远端访问目标。
 */
export type AgentChatRemoteTarget = {
    /** 远端访问 URL。 */
    url: string;
};
/**
 * 生成 CLI chat 专用的新 sessionId。
 */
export declare function createAgentChatSessionId(): string;
/**
 * 解析 chat 远程目标地址。
 */
export declare function resolveAgentChatRemoteTarget(params: {
    projectRoot: string;
    transport?: AgentChatTransportOptions;
}): Promise<AgentChatRemoteTarget>;
/**
 * 创建 RemoteAgent 实例。
 */
export declare function createRemoteAgent(params: {
    projectRoot: string;
    transport?: AgentChatTransportOptions;
}): Promise<RemoteAgent>;
/**
 * 列出远程 chat session 摘要。
 */
export declare function listRemoteChatSessions(params: {
    remote_agent: RemoteAgent;
}): Promise<AgentChatSessionSummaryView[]>;
/**
 * 创建远程 chat session。
 */
export declare function createRemoteChatSession(params: {
    remote_agent: RemoteAgent;
    session_id?: string;
}): Promise<{
    session_id: string;
}>;
/**
 * 获取或创建远程 session。
 */
export declare function getOrCreateRemoteSession(params: {
    remote_agent: RemoteAgent;
    session_id: string;
    create_new_session?: boolean;
}): Promise<RemoteAgentSession>;
/**
 * 把 SDK session 摘要转换成 CLI 视图。
 */
export declare function toSessionSummaryView(summary: AgentSessionSummary): AgentChatSessionSummaryView;
/**
 * 构建 session 选择项描述文本。
 */
export declare function buildSessionChoiceDescription(summary: AgentChatSessionSummaryView): string;
/**
 * 构建 chat 失败提示文本。
 */
export declare function buildAgentChatFailureText(error?: string): string;
//# sourceMappingURL=AgentChatRemote.d.ts.map