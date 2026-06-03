/**
 * Control execute by session helper。
 *
 * 关键点（中文）
 * - control 层只负责把请求转成 session prompt。
 * - chat / queue 等渠道语义由宿主显式注入的 plugin 自行实现。
 */
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import type { ControlSessionExecuteAttachmentInput } from "../../agent/control/types/ControlSessionExecute.js";
/**
 * 在指定 session 中执行一轮请求。
 *
 * 说明（中文）
 * - 按普通 session 同步执行。
 */
export declare function executeBySessionId(params: {
    agentState: AgentRuntime;
    sessionId: string;
    instructions: string;
    attachments?: ControlSessionExecuteAttachmentInput[];
}): Promise<{
    assistantMessage: import("@downcity/agent/internal/executor/types/SessionMessages.js").SessionMessageV1 | undefined;
    userVisible: string;
    queued: boolean;
    error?: string | undefined;
    success: boolean;
}>;
//# sourceMappingURL=ExecuteBySession.d.ts.map