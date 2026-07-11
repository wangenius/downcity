/**
 * `city agent chat` 统一入口。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 * - 远程访问统一走 `RemoteAgent({ url })`，不再在 CLI 侧维护第二套 HTTP SDK transport。
 * - 远程连接、session 创建/列表等操作委托给 `AgentChatRemote.ts`。
 */

import { emitCliBlock } from "@/shared/CliReporter.js";
import {
  createRemoteChatSession,
  listRemoteChatSessions,
} from "@/city/agent/AgentChatRemote.js";
import { run_agent_chat_tui } from "@/city/agent/AgentChatTui.js";
import type { AgentChatCliOptions } from "@/city/agent/AgentChatTypes.js";
import {
  normalizeChatMessage,
  resolveAgentChatSessionOptions,
  resolveChatTargetAgentId,
  resolveInteractiveChatSession,
  runOneShotChat,
  runSdkPromptTurn,
} from "@/city/agent/AgentChatHelpers.js";
import { timeline_events_to_entries } from "@/city/agent/tui/history/HistoryLoader.js";
import type { AgentSessionTimelineEvent } from "@downcity/agent";

/**
 * `city agent chat` 统一入口。
 */
export async function chatCommand(options: AgentChatCliOptions): Promise<void> {
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
  if (!agentId) return;

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
      list_sessions: async () =>
        await listRemoteChatSessions({
          remote_agent: interactive.remote_agent,
        }),
      create_session: async () =>
        await createRemoteChatSession({
          remote_agent: interactive.remote_agent,
        }),
      load_session_history: async (session_id) => {
        const session = await interactive.remote_agent.sessions.get(session_id);
        const records = await session.records({
          view: "timeline",
          order: "asc",
          limit: 200,
        });
        const title = records.session.title?.trim() || "Untitled";
        const entries = timeline_events_to_entries(
          records.items as AgentSessionTimelineEvent[],
        );
        return { title, entries };
      },
      approve: async (approval_id) =>
        await interactive.remote_agent.approve({ approval_id }),
      deny: async (approval_id) =>
        await interactive.remote_agent.deny({ approval_id }),
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
  } finally {
    await interactive.remote_agent.close();
  }
}
