/**
 * `city agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 * - 远程访问统一走 `RemoteAgent({ url })`，不再在 CLI 侧维护第二套 HTTP SDK transport。
 */
import type { AgentChatCliOptions, AgentChatExecutionOutcome, AgentChatSessionOptions, AgentChatTransportOptions } from "./AgentChatTypes.js";
/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export declare function executeAgentChatTurn(params: {
    agentId: string;
    message: string;
    sessionOptions?: AgentChatSessionOptions;
    transport?: AgentChatTransportOptions;
}): Promise<AgentChatExecutionOutcome>;
/**
 * `city agent chat` 统一入口。
 */
export declare function chatCommand(options: AgentChatCliOptions): Promise<void>;
//# sourceMappingURL=AgentChat.d.ts.map