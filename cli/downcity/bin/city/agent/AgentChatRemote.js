/**
 * Agent Chat 远程连接与会话管理模块。
 *
 * 关键点（中文）
 * - 封装 `RemoteAgent` 创建、session 列表、session 创建/获取等远程操作。
 * - 不处理命令行交互与本地 agent 解析，只负责与 daemon RPC 的通信侧逻辑。
 */
import { generateId } from "../../city/utils/Id.js";
import { RemoteAgent, } from "@downcity/agent";
import { resolveDaemonRpcEndpoint } from "../../city/process/daemon/Client.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID, AGENT_CHAT_NEW_SESSION_ID_PREFIX, } from "../../city/agent/AgentChatTypes.js";
/**
 * 生成 CLI chat 专用的新 sessionId。
 */
export function createAgentChatSessionId() {
    return [
        AGENT_CHAT_NEW_SESSION_ID_PREFIX,
        Date.now(),
        generateId().slice(0, 8),
    ].join("-");
}
/**
 * 解析 chat 远程目标地址。
 */
export async function resolveAgentChatRemoteTarget(params) {
    // 关键点（中文）：chat 固定走 Agent 本机 RPC，由 City 负责对外暴露。
    const endpoint = resolveDaemonRpcEndpoint({
        projectRoot: params.projectRoot,
        host: params.transport?.host,
        port: params.transport?.port,
    });
    return {
        url: `rpc://${endpoint.host}:${endpoint.port}`,
    };
}
/**
 * 创建 RemoteAgent 实例。
 */
export async function createRemoteAgent(params) {
    const target = await resolveAgentChatRemoteTarget(params);
    return new RemoteAgent({
        url: target.url,
    });
}
/**
 * 列出远程 chat session 摘要。
 */
export async function listRemoteChatSessions(params) {
    const page = await params.remote_agent.list_sessions({ limit: 30 });
    const sessions = page.items.map(toSessionSummaryView);
    if (!sessions.some((item) => item.sessionId === AGENT_CHAT_DEFAULT_SESSION_ID)) {
        sessions.unshift({
            sessionId: AGENT_CHAT_DEFAULT_SESSION_ID,
            messageCount: 0,
        });
    }
    return sessions;
}
/**
 * 创建远程 chat session。
 */
export async function createRemoteChatSession(params) {
    const session_id = String(params.session_id || "").trim() || createAgentChatSessionId();
    const session = await params.remote_agent.create_session({
        sessionId: session_id,
    });
    return {
        session_id: session.id,
    };
}
/**
 * 获取或创建远程 session。
 */
export async function getOrCreateRemoteSession(params) {
    if (params.create_new_session === true) {
        return await params.remote_agent.create_session({
            sessionId: params.session_id,
        });
    }
    try {
        return await params.remote_agent.get_session(params.session_id);
    }
    catch {
        return await params.remote_agent.create_session({
            sessionId: params.session_id,
        });
    }
}
/**
 * 把 SDK session 摘要转换成 CLI 视图。
 */
export function toSessionSummaryView(summary) {
    return {
        sessionId: summary.sessionId,
        ...(summary.title ? { title: summary.title } : {}),
        ...(summary.previewText ? { previewText: summary.previewText } : {}),
        messageCount: summary.messageCount,
        ...(typeof summary.updatedAt === "number" ? { updatedAt: summary.updatedAt } : {}),
        ...(summary.executing ? { executing: true } : {}),
    };
}
/**
 * 构建 session 选择项描述文本。
 */
export function buildSessionChoiceDescription(summary) {
    const parts = [
        `${summary.messageCount} messages`,
        summary.previewText || "",
        summary.executing ? "running" : "",
    ].filter(Boolean);
    return parts.join(" · ");
}
/**
 * 构建 chat 失败提示文本。
 */
export function buildAgentChatFailureText(error) {
    return (String(error || "").trim() ||
        "Agent daemon returned empty error (check config with `city agent status`)");
}
//# sourceMappingURL=AgentChatRemote.js.map