/**
 * `city agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 * - 远程访问统一走 `RemoteAgent({ url })`，不再在 CLI 侧维护第二套 HTTP SDK transport。
 * - 远程连接、session 创建/列表等操作委托给 `AgentChatRemote.ts`。
 */
import prompts from "../tui/Prompts.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { resolveProjectRootByAgentId, validateAgentProjectRoot, } from "../shared/PluginTargetSupport.js";
import { listRegisteredAgentsForCli } from "./AgentSelection.js";
import { createAgentChatSessionId, createRemoteAgent, createRemoteChatSession, getOrCreateRemoteSession, listRemoteChatSessions, buildAgentChatFailureText, } from "./AgentChatRemote.js";
import { run_agent_chat_tui } from "./AgentChatTui.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID, } from "./AgentChatTypes.js";
function normalizeChatMessage(input) {
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
function resolveAgentChatSessionOptions(input) {
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
function hasExplicitSessionSelection(input) {
    return Boolean(String(input.sessionId || "").trim() || input.newSession === true);
}
async function resolveChatTargetAgentId(inputId) {
    const explicit = String(inputId || "").trim();
    if (explicit)
        return explicit;
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        emitCliBlock({
            tone: "error",
            title: "Agent id is required",
            note: "Use `city agent chat --to <id>` or run this command in an interactive terminal.",
        });
        return null;
    }
    const runningAgents = (await listRegisteredAgentsForCli()).filter((item) => item.status === "running");
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
    }));
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
async function resolveAgentChatTarget(agentIdInput, sessionOptions) {
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
    const registeredAgent = registeredAgents.find((item) => item.projectRoot === resolved.projectRoot || item.id === agentId);
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
function printAssistantReply(replyText) {
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
function printAgentChatFailure(params) {
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
async function resolveInteractiveChatSession(params) {
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
            show_initial_picker: false,
        };
    }
    // 关键点（中文）：未显式指定 session 时，进入 TUI 后由 SessionPicker 自行选择。
    return {
        success: true,
        target: resolved.target,
        remote_agent,
        show_initial_picker: true,
    };
}
async function runSdkPromptTurn(params) {
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
    const pending_events = [];
    const renderEvent = (event) => {
        if (params.interactiveRenderer) {
            params.interactiveRenderer.render_event(event);
            return;
        }
        if (event.type === "tool-approval-request") {
            const operation = event.operation || (event.toolName === "shell_write" ? "write" : "exec");
            const command_label = operation === "write" ? "input_preview" : "cmd";
            const command_value = operation === "write" ? event.inputPreview || event.cmd : event.cmd;
            emitCliBlock({
                tone: "info",
                title: "Unrestricted sandbox approval requested",
                facts: [
                    { label: "approval_id", value: event.approvalId },
                    { label: "tool", value: event.toolName },
                    { label: "operation", value: operation },
                    ...(event.shellId ? [{ label: "shell_id", value: event.shellId }] : []),
                    { label: command_label, value: command_value },
                    ...(typeof event.inputChars === "number"
                        ? [{ label: "input_chars", value: String(event.inputChars) }]
                        : []),
                    { label: "cwd", value: event.cwd },
                    { label: "reason", value: event.reason },
                ],
                note: "Approve or deny this request from a client that calls agent.approve({ approval_id }) or agent.deny({ approval_id }).",
            });
            return;
        }
        if (event.type === "tool-approval-result") {
            emitCliBlock({
                tone: event.decision === "approved" ? "success" : "error",
                title: "Unrestricted sandbox approval resolved",
                facts: [
                    { label: "approval_id", value: event.approvalId },
                    { label: "decision", value: event.decision },
                ],
            });
            return;
        }
        if (event.type !== "text-delta" || event.turnId !== target_turn_id || !event.text) {
            return;
        }
        if (params.renderText === false)
            return;
        if (!printed_leading_newline) {
            process.stdout.write("\n");
            printed_leading_newline = true;
        }
        process.stdout.write(event.text);
        emitted_visible_text = true;
    };
    const unsubscribe = session.subscribe((event) => {
        if (!target_turn_id) {
            pending_events.push(event);
            return;
        }
        const is_approval_event = event.type === "tool-approval-request" || event.type === "tool-approval-result";
        if (!is_approval_event && "turnId" in event && event.turnId && event.turnId !== target_turn_id)
            return;
        renderEvent(event);
        if (event.type === "turn-finish") {
            final_text = event.text;
        }
    });
    try {
        params.interactiveRenderer?.start_turn();
        const turn = await session.prompt({ query: message });
        target_turn_id = turn.id;
        params.interactiveRenderer?.attach_turn_id(target_turn_id);
        for (const event of pending_events) {
            const is_approval_event = event.type === "tool-approval-request" || event.type === "tool-approval-result";
            if (!is_approval_event && "turnId" in event && event.turnId && event.turnId !== target_turn_id)
                continue;
            renderEvent(event);
            if (event.type === "turn-finish") {
                final_text = event.text;
            }
        }
        const result = await turn.finished;
        final_text = result.text;
        if (params.interactiveRenderer) {
            emitted_visible_text =
                params.interactiveRenderer.finish_turn().emitted_visible_text;
        }
        else if (printed_leading_newline) {
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
    }
    catch (error) {
        if (params.interactiveRenderer) {
            emitted_visible_text =
                params.interactiveRenderer.finish_turn().emitted_visible_text;
        }
        else if (printed_leading_newline) {
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
    }
    finally {
        unsubscribe();
        await remote_agent.close();
    }
}
/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export async function executeAgentChatTurn(params) {
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
async function runOneShotChat(params) {
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
    if (!outcome.emittedVisibleText)
        printAssistantReply("");
}
/**
 * `city agent chat` 统一入口。
 */
export async function chatCommand(options) {
    const resolved_session = resolveAgentChatSessionOptions(options);
    if (!resolved_session.success) {
        emitCliBlock({
            tone: "error",
            title: "Invalid chat session options",
            note: resolved_session.error,
        });
        return;
    }
    const agentId = await resolveChatTargetAgentId(options.to);
    if (!agentId)
        return;
    const oneShotMessage = normalizeChatMessage(String(options.message || ""));
    if (oneShotMessage) {
        await runOneShotChat({
            agentId,
            message: oneShotMessage,
            options,
        });
        return;
    }
    if (options.json === true) {
        emitCliBlock({
            tone: "error",
            title: "JSON mode requires --message",
            note: "Use `city agent chat --message <text> --json` for one-shot structured output.",
        });
        return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        emitCliBlock({
            tone: "error",
            title: "Interactive terminal required",
            note: "Use this command in a local terminal with TTY support, or pass `--message` for one-shot mode.",
        });
        return;
    }
    const interactive = await resolveInteractiveChatSession({
        agentId,
        options,
        transport: {
            host: options.host,
            port: options.port,
        },
    });
    if (!interactive.success) {
        if (interactive.error) {
            emitCliBlock({
                tone: "error",
                title: "Agent chat failed",
                note: interactive.error,
            });
        }
        return;
    }
    try {
        await run_agent_chat_tui({
            agent_id: agentId,
            session_id: interactive.target.sessionId,
            show_initial_picker: interactive.show_initial_picker,
            list_sessions: async () => await listRemoteChatSessions({
                remote_agent: interactive.remote_agent,
            }),
            create_session: async () => await createRemoteChatSession({
                remote_agent: interactive.remote_agent,
            }),
            run_turn: async ({ session_id, message, interactive_renderer }) => {
                const outcome = await runSdkPromptTurn({
                    agentId,
                    message,
                    sessionOptions: {
                        sessionId: session_id,
                        newSession: false,
                    },
                    transport: {
                        host: options.host,
                        port: options.port,
                    },
                    interactiveRenderer: interactive_renderer,
                });
                return {
                    success: outcome.success,
                    error: outcome.error,
                    emitted_visible_text: outcome.emittedVisibleText,
                    text: outcome.text,
                };
            },
        });
    }
    finally {
        await interactive.remote_agent.close();
    }
}
//# sourceMappingURL=AgentChat.js.map