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

import prompts from "@/city/tui/Prompts.js";
import {
  RemoteAgent,
  type SessionMutation,
} from "@downcity/agent";
import { emitCliBlock } from "@/shared/CliReporter.js";
import { printResult } from "@/city/utils/cli/CliOutput.js";
import {
  resolveProjectRootByAgentId,
  validateAgentProjectRoot,
} from "@/city/shared/PluginTargetSupport.js";
import { listRegisteredAgentsForCli } from "@/city/agent/AgentSelection.js";
import {
  createAgentChatSessionId,
  createRemoteAgent,
  createRemoteChatSession,
  getOrCreateRemoteSession,
  buildAgentChatFailureText,
  listRemoteChatSessions,
} from "@/city/agent/AgentChatRemote.js";
import type {
  AgentChatCliOptions,
  AgentChatExecutionOutcome,
  AgentChatSessionOptions,
} from "@/city/agent/AgentChatTypes.js";
import {
  AGENT_CHAT_DEFAULT_SESSION_ID,
} from "@/city/agent/AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "@/city/types/AgentChatInteractive.js";

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

export function normalizeChatMessage(input: string): string {
  return String(input || "").trim();
}

/**
 * 解析 `city agent chat` 的 session 选择语义。
 *
 * 关键点（中文）
 * - 默认继续使用 `local-cli-chat-main`，保持老命令行为稳定。
 * - `--new-session` 生成不可预测的新 ID，避免用户手动清理旧上下文。
 * - `--session-id` 与 `--new-session` 互斥，避免“复用”和“新建”语义冲突。
 */
export function resolveAgentChatSessionOptions(
  input?: AgentChatSessionOptions,
):
  | {
      success: true;
      session_id: string;
      create_new_session: boolean;
    }
  | {
      success: false;
      error: string;
    } {
  const explicit_session_id = String(input?.sessionId || "").trim();
  const should_create_new_session = input?.newSession === true;

  if (explicit_session_id && should_create_new_session) {
    return {
      success: false,
      error: "`--session-id` and `--new-session` cannot be used together.",
    };
  }

  if (should_create_new_session) {
    return {
      success: true,
      session_id: createAgentChatSessionId(),
      create_new_session: true,
    };
  }

  return {
    success: true,
    session_id: explicit_session_id || AGENT_CHAT_DEFAULT_SESSION_ID,
    create_new_session: false,
  };
}

export function hasExplicitSessionSelection(input: AgentChatSessionOptions): boolean {
  return Boolean(String(input.sessionId || "").trim() || input.newSession === true);
}

export async function resolveChatTargetAgentId(inputId?: string): Promise<string | null> {
  const explicit = String(inputId || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Agent id is required",
      note: "Use `city agent chat --to <id>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const runningAgents = (await listRegisteredAgentsForCli()).filter(
    (item) => item.status === "running",
  );
  if (runningAgents.length === 0) {
    emitCliBlock({
      tone: "error",
      title: "No running agents",
      note: "Run `city agent start` first.",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "agentId",
    message: "选择要聊天的 Agent",
    choices: runningAgents.map((agent) => ({
      title: agent.id,
      description: agent.projectRoot,
      value: agent.id,
    })),
    initial: 0,
  })) as { agentId?: string };
  const agentId = String(response.agentId || "").trim();
  if (!agentId) {
    emitCliBlock({
      tone: "info",
      title: "Agent chat cancelled",
    });
    return null;
  }
  return agentId;
}

export async function resolveAgentChatTarget(
  agentIdInput: string,
  sessionOptions?: AgentChatSessionOptions,
): Promise<
  | {
      success: true;
      target: ResolvedAgentChatTarget;
    }
  | {
      success: false;
      outcome: AgentChatExecutionOutcome;
    }
> {
  const agentId = String(agentIdInput || "").trim();
  const resolved_session = resolveAgentChatSessionOptions(sessionOptions);
  const sessionId = resolved_session.success
    ? resolved_session.session_id
    : AGENT_CHAT_DEFAULT_SESSION_ID;
  if (!resolved_session.success) {
    return {
      success: false,
      outcome: {
        agentId,
        sessionId,
        success: false,
        error: resolved_session.error,
      },
    };
  }

  if (!agentId) {
    return {
      success: false,
      outcome: {
        agentId: "",
        sessionId,
        success: false,
        error: "Missing target agent id.",
      },
    };
  }

  const resolved = await resolveProjectRootByAgentId(agentId);
  if (!resolved.projectRoot) {
    return {
      success: false,
      outcome: {
        agentId,
        sessionId,
        success: false,
        error: resolved.error || "Failed to resolve agent project path",
      },
    };
  }

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
  if (pathError) {
    return {
      success: false,
      outcome: {
        agentId,
        projectRoot: resolved.projectRoot,
        sessionId,
        success: false,
        error: pathError,
      },
    };
  }

  const registeredAgents = await listRegisteredAgentsForCli();
  const registeredAgent = registeredAgents.find(
    (item) =>
      item.projectRoot === resolved.projectRoot || item.id === agentId,
  );
  if (registeredAgent && registeredAgent.status !== "running") {
    return {
      success: false,
      outcome: {
        agentId,
        projectRoot: resolved.projectRoot,
        sessionId,
        success: false,
        error: "Agent is not running. Run `city agent start` first.",
      },
    };
  }

  return {
    success: true,
    target: {
      agentId,
      projectRoot: resolved.projectRoot,
      sessionId,
      createNewSession: resolved_session.create_new_session,
    },
  };
}

export function printAssistantReply(replyText: string): void {
  const text = String(replyText || "").trim();
  if (!text) {
    emitCliBlock({
      tone: "info",
      title: "No visible reply",
      note: "The turn completed, but no user-visible text was returned.",
    });
    return;
  }
  console.log(`\n${text}\n`);
}

export function printAgentChatFailure(params: {
  agentId: string;
  error?: string;
}): void {
  emitCliBlock({
    tone: "error",
    title: "Agent chat failed",
    facts: [
      {
        label: "agent",
        value: params.agentId,
      },
      {
        label: "error",
        value: buildAgentChatFailureText(params.error),
      },
    ],
  });
}

export async function resolveInteractiveChatSession(params: {
  agentId: string;
  options: AgentChatCliOptions;
  transport?: { host?: string; port?: number };
}): Promise<
  | {
      success: true;
      target: ResolvedAgentChatTarget;
      remote_agent: RemoteAgent;
    }
  | {
      success: false;
      error?: string;
    }
> {
  const preselected_session = resolveAgentChatSessionOptions(params.options);
  if (!preselected_session.success) {
    return {
      success: false,
      error: preselected_session.error,
    };
  }

  const resolved = await resolveAgentChatTarget(params.agentId, {
    sessionId: preselected_session.session_id,
    newSession: false,
  });
  if (!resolved.success) {
    return {
      success: false,
      error: resolved.outcome.error,
    };
  }
  resolved.target.createNewSession = preselected_session.create_new_session;

  const remote_agent = await createRemoteAgent({
    projectRoot: resolved.target.projectRoot,
    transport: params.transport,
  });

  if (hasExplicitSessionSelection(params.options)) {
    if (resolved.target.createNewSession) {
      const created = await createRemoteChatSession({
        remote_agent,
        session_id: preselected_session.session_id,
      });
      resolved.target.sessionId = created.session_id;
      resolved.target.createNewSession = false;
    }
    return {
      success: true,
      target: resolved.target,
      remote_agent,
    };
  }

  // 关键点（中文）：未显式指定 session 时，直接复用最近活跃的会话，
  // 不再弹出 SessionPicker；没有任何历史会话时回落到默认 session。
  // 用户仍可在 TUI 内通过 /session 命令随时切换。
  const latest_session_id = await resolveLatestChatSessionId({ remote_agent });
  if (latest_session_id) {
    resolved.target.sessionId = latest_session_id;
  }
  return {
    success: true,
    target: resolved.target,
    remote_agent,
  };
}

/**
 * 解析最近活跃的 chat session id。
 *
 * 说明（中文）
 * - 按 `updatedAt` 取最新的会话；缺失 `updatedAt` 视为最旧。
 * - 列表为空时返回 null，由调用方回落到默认 session。
 *
 * @param params.remote_agent 远程 agent 句柄。
 * @returns 最近活跃的 session id；无历史会话时为 null。
 */
async function resolveLatestChatSessionId(params: {
  remote_agent: RemoteAgent;
}): Promise<string | null> {
  let sessions: Awaited<ReturnType<typeof listRemoteChatSessions>>;
  try {
    sessions = await listRemoteChatSessions({ remote_agent: params.remote_agent });
  } catch {
    return null;
  }
  if (sessions.length === 0) {
    return null;
  }
  let latest = sessions[0];
  for (const candidate of sessions) {
    if ((candidate.updatedAt ?? 0) > (latest.updatedAt ?? 0)) {
      latest = candidate;
    }
  }
  return latest.sessionId;
}

export async function runSdkPromptTurn(params: {
  agentId: string;
  message: string;
  sessionOptions?: AgentChatSessionOptions;
  transport?: { host?: string; port?: number };
  renderText?: boolean;
  interactiveRenderer?: AgentChatInteractiveRendererPort;
}): Promise<{
  success: boolean;
  error?: string;
  emittedVisibleText: boolean;
  sessionId: string;
  projectRoot?: string;
  text?: string;
}> {
  const message = normalizeChatMessage(params.message);
  const resolved_session = resolveAgentChatSessionOptions(params.sessionOptions);
  if (!message) {
    return {
      success: false,
      error: "Chat message is required.",
      emittedVisibleText: false,
      sessionId: resolved_session.success
        ? resolved_session.session_id
        : AGENT_CHAT_DEFAULT_SESSION_ID,
      text: "",
    };
  }

  const resolved = await resolveAgentChatTarget(params.agentId, params.sessionOptions);
  if (!resolved.success) {
    return {
      success: false,
      error: resolved.outcome.error,
      emittedVisibleText: false,
      sessionId: resolved.outcome.sessionId,
      ...(resolved.outcome.projectRoot ? { projectRoot: resolved.outcome.projectRoot } : {}),
      text: "",
    };
  }

  const remote_agent = await createRemoteAgent({
    projectRoot: resolved.target.projectRoot,
    transport: params.transport,
  });
  const session = await getOrCreateRemoteSession({
    remote_agent,
    session_id: resolved.target.sessionId,
    create_new_session: resolved.target.createNewSession,
  });

  let printed_leading_newline = false;
  let emitted_visible_text = false;
  let final_text = "";
  let target_turn_id = "";
  const pending_events: SessionMutation[] = [];

  const renderEvent = (event: SessionMutation): void => {
    if (params.interactiveRenderer) {
      params.interactiveRenderer.render_event(event);
      return;
    }
    if (
      event.variant !== "delta" ||
      event.type !== "text" ||
      event.turn_id !== target_turn_id ||
      !event.delta
    ) {
      return;
    }
    if (params.renderText === false) return;
    if (!printed_leading_newline) {
      process.stdout.write("\n");
      printed_leading_newline = true;
    }
    process.stdout.write(event.delta);
    emitted_visible_text = true;
  };

  const unsubscribe = session.subscribe((event) => {
    if (!target_turn_id) {
      pending_events.push(event);
      return;
    }
    const event_turn_id = "turn_id" in event ? event.turn_id : undefined;
    if (event_turn_id && event_turn_id !== target_turn_id) return;
    renderEvent(event);
  });

  try {
    params.interactiveRenderer?.start_turn();
    const turn = await session.prompt({ query: message });
    target_turn_id = turn.id;
    params.interactiveRenderer?.attach_turn_id(target_turn_id);

    for (const event of pending_events) {
      const event_turn_id = "turn_id" in event ? event.turn_id : undefined;
      if (event_turn_id && event_turn_id !== target_turn_id) continue;
      renderEvent(event);
    }

    const result = await turn.finished;
    final_text = result.text;

    if (params.interactiveRenderer) {
      emitted_visible_text =
        params.interactiveRenderer.finish_turn().emitted_visible_text;
    } else if (printed_leading_newline) {
      process.stdout.write("\n\n");
    }

    return {
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
      emittedVisibleText: emitted_visible_text,
      sessionId: resolved.target.sessionId,
      projectRoot: resolved.target.projectRoot,
      text: final_text,
    };
  } catch (error) {
    if (params.interactiveRenderer) {
      emitted_visible_text =
        params.interactiveRenderer.finish_turn().emitted_visible_text;
    } else if (printed_leading_newline) {
      process.stdout.write("\n\n");
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      emittedVisibleText: emitted_visible_text,
      sessionId: resolved.target.sessionId,
      projectRoot: resolved.target.projectRoot,
      text: final_text,
    };
  } finally {
    unsubscribe();
    await remote_agent.close();
  }
}

/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export async function executeAgentChatTurn(params: {
  agentId: string;
  message: string;
  sessionOptions?: AgentChatSessionOptions;
  transport?: { host?: string; port?: number };
}): Promise<AgentChatExecutionOutcome> {
  const message = normalizeChatMessage(params.message);
  const resolved_session = resolveAgentChatSessionOptions(params.sessionOptions);
  const sessionId = resolved_session.success
    ? resolved_session.session_id
    : AGENT_CHAT_DEFAULT_SESSION_ID;

  if (!message) {
    return {
      agentId: String(params.agentId || "").trim(),
      sessionId,
      success: false,
      error: "Chat message is required.",
    };
  }

  const outcome = await runSdkPromptTurn({
    agentId: params.agentId,
    message,
    sessionOptions: params.sessionOptions,
    transport: params.transport,
    renderText: false,
  });

  return {
    agentId: params.agentId,
    ...(outcome.projectRoot ? { projectRoot: outcome.projectRoot } : {}),
    sessionId: outcome.sessionId,
    success: outcome.success,
    payload: {
      success: outcome.success,
      sessionId: outcome.sessionId,
      result: {
        success: outcome.success,
        userVisible: outcome.text || "",
        ...(outcome.error ? { error: outcome.error } : {}),
      },
      ...(outcome.error ? { error: outcome.error } : {}),
    },
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}

export async function runOneShotChat(params: {
  agentId: string;
  message: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  if (params.options.json === true) {
    const outcome = await executeAgentChatTurn({
      agentId: params.agentId,
      message: params.message,
      sessionOptions: {
        sessionId: params.options.sessionId,
        newSession: params.options.newSession,
      },
      transport: {
        host: params.options.host,
        port: params.options.port,
      },
    });
    printResult({
      asJson: true,
      success: outcome.success,
      title: "agent chat",
      payload: {
        agent: params.agentId,
        ...(outcome.projectRoot ? { projectRoot: outcome.projectRoot } : {}),
        sessionId: outcome.sessionId,
        ...(outcome.payload?.result ? { result: outcome.payload.result } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      },
    });
    return;
  }

  const outcome = await runSdkPromptTurn({
    agentId: params.agentId,
    message: params.message,
    sessionOptions: {
      sessionId: params.options.sessionId,
      newSession: params.options.newSession,
    },
    transport: {
      host: params.options.host,
      port: params.options.port,
    },
  });

  if (!outcome.success) {
    printAgentChatFailure({
      agentId: params.agentId,
      error: outcome.error,
    });
    return;
  }

  if (!outcome.emittedVisibleText) printAssistantReply("");
}
