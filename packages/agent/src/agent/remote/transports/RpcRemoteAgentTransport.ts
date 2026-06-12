/**
 * RemoteAgent RPC transport。
 *
 * 关键点（中文）
 * - 只把 RemoteAgent 的 session actor 方法映射到 RpcClient。
 * - 长连接生命周期由 RpcClient 管理。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import { RpcClient, parse_rpc_url } from "@/rpc/Client.js";
import type {
  RemoteAgentTransport,
  TransportSubscription,
} from "@/agent/remote/RemoteTransport.js";
import type {
  ShellApprovalMode,
  ShellApprovalDecisionResult,
  ShellApprovalModeUpdateResult,
  ShellApprovalModeOption,
  ShellSessionApprovalModeView,
  ShellApprovalView,
} from "@downcity/shell";

/**
 * 本机 RPC transport。
 */
export class RpcRemoteAgentTransport implements RemoteAgentTransport {
  private readonly client: RpcClient;

  constructor(url: string) {
    this.client = new RpcClient(parse_rpc_url(url));
  }

  async create_session(input?: AgentCreateSessionInput): Promise<AgentSessionInfo> {
    return await this.client.create_session(input);
  }

  async get_info(session_id: string): Promise<AgentSessionInfo> {
    return await this.client.get_session(session_id);
  }

  async prompt(
    session_id: string,
    input: AgentSessionPromptInput,
  ): Promise<{ id: string }> {
    return await this.client.prompt_session({
      session_id,
      input,
    });
  }

  async subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<TransportSubscription> {
    const subscription = await this.client.subscribe_session({
      session_id: params.session_id,
      on_ready: params.on_ready,
      on_event: params.on_event,
    });
    return {
      close: async () => {
        await subscription.unsubscribe();
      },
    };
  }

  async history(
    session_id: string,
    input?: AgentSessionHistoryInput,
  ): Promise<AgentSessionHistoryPage> {
    return await this.client.get_session_history({
      session_id,
      input,
    });
  }

  async system(session_id: string): Promise<AgentSessionSystemSnapshot> {
    return await this.client.get_session_system(session_id);
  }

  async fork(
    session_id: string,
    input?: AgentSessionForkInput | string,
  ): Promise<AgentSessionInfo> {
    const message_id =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    return await this.client.fork_session({
      session_id,
      ...(message_id ? { message_id } : {}),
    });
  }

  async list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage> {
    return await this.client.list_sessions(input);
  }

  async run_plugin_action(
    input: RemoteAgentPluginActionInput,
  ): Promise<RemoteAgentPluginActionResult> {
    return await this.client.run_internal_plugin_action({
      plugin_name: input.plugin,
      action_name: input.action,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    });
  }

  async approvals(): Promise<ShellApprovalView[]> {
    return await this.client.list_shell_approvals();
  }

  async approval_modes(): Promise<ShellApprovalModeOption[]> {
    return await this.client.list_shell_approval_modes();
  }

  async approval_mode(input: { session_id: string }): Promise<ShellSessionApprovalModeView> {
    return await this.client.get_shell_approval_mode(input.session_id);
  }

  async set_approval_mode(input: {
    session_id: string;
    mode: ShellApprovalMode;
  }): Promise<ShellApprovalModeUpdateResult> {
    return await this.client.set_shell_approval_mode(input);
  }

  async approve(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    return await this.client.approve_shell_approval(input.approval_id);
  }

  async deny(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    return await this.client.deny_shell_approval(input.approval_id);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
