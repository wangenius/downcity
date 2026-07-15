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
import {
  read_session_model_override,
  write_session_model_override,
} from "@/city/agent/CitySessionModelRuntime.js";
import { readAgentConfig } from "@/city/process/registry/AgentConfigStore.js";
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
import { session_messages_to_entries } from "@/city/agent/tui/history/HistoryLoader.js";
import { listPlatformModelChoices } from "@/city/runtime/city-model/ExecutionModelBinding.js";

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
    const list_models = async () => {
      const choices = await listPlatformModelChoices();
      return choices.map((choice) => ({
        model_id: choice.value,
        model_name: choice.model.name || choice.value,
        modalities: [...choice.model.modalities],
      }));
    };

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
      list_models,
      update_session_model: async (session_id, model_id) => {
        write_session_model_override(
          interactive.target.projectRoot,
          session_id,
          model_id,
        );
      },
      load_session_history: async (session_id) => {
        const session = await interactive.remote_agent.sessions.get(session_id);
        const [info, messages] = await Promise.all([
          session.get_info(),
          session.messages(),
        ]);
        const title = info.title?.trim() || "Untitled";
        const config = readAgentConfig(interactive.target.projectRoot);
        const default_model_id = String(
          config?.execution?.type === "api"
            ? config.execution.modelId || ""
            : "",
        ).trim();
        const model_id = String(
          read_session_model_override(
            interactive.target.projectRoot,
            session_id,
          ) || default_model_id,
        ).trim() || undefined;
        let model_name = model_id;
        if (model_id) {
          try {
            const models = await list_models();
            model_name = models.find((model) => model.model_id === model_id)?.model_name || model_id;
          } catch {
            // 关键点（中文）：目录查询失败不阻塞历史加载，footer 回退展示稳定 model id。
          }
        }
        const entries = session_messages_to_entries(messages.items);
        return { title, model_id, model_name, entries };
      },
      resolve_approval: async (session_id, approval_id, decision) => {
        const session = await interactive.remote_agent.sessions.get(session_id);
        return await session.resolve_approval({ approval_id, decision });
      },
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
