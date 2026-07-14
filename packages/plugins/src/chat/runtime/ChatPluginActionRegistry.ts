/**
 * ChatPluginActions：chat plugin runtime 的 action 注册表模块。
 *
 * 关键点（中文）
 * - 这里专门负责把 chat 的 CLI/execute 定义装配成 `PluginActions`。
 * - `ChatPlugin` 本体只保留实例状态与 lifecycle，不再承载大段 action 声明。
 * - action 执行仍然复用各 runtime 模块，确保行为与现有实现保持一致。
 */

import type { Command } from "commander";
import type { PluginActions } from "@downcity/agent";
import { createAction } from "@downcity/agent";
import { z } from "zod";
import type {
  ChatCloseActionPayload,
  ChatConfigurationActionPayload,
  ChatConfigureActionPayload,
  ChatDeleteActionPayload,
  ChatHistoryActionPayload,
  ChatInfoActionPayload,
  ChatListActionPayload,
  ChatOpenActionPayload,
  ChatReactActionPayload,
  ChatReconnectActionPayload,
  ChatSendActionPayload,
  ChatSessionActionPayload,
  ChatStatusActionPayload,
  ChatTestActionPayload,
} from "@/chat/types/ChatPluginActionPayload.js";
import type { ChatChannelState } from "@/chat/types/ChatRuntime.js";
import {
  mapChatChannelCommandInput,
  mapChatConfigureCommandInput,
  mapChatDeleteCommandInput,
  mapChatHistoryCommandInput,
  mapChatInfoCommandInput,
  mapChatListCommandInput,
  mapChatReactCommandInput,
  mapChatSendCommandInput,
} from "./ChatActionInput.js";
import {
  executeChatContextAction,
  executeChatDeleteAction,
  executeChatHistoryAction,
  executeChatInfoAction,
  executeChatListAction,
  executeChatReactAction,
  executeChatSendAction,
} from "./ChatActionExecution.js";
import {
  executeChatCloseAction,
  executeChatConfigurationAction,
  executeChatConfigureAction,
  executeChatOpenAction,
  executeChatReconnectAction,
  executeChatStatusAction,
  executeChatTestAction,
} from "./ChatChannelFacade.js";

const CHAT_SEND_HELP_TEXT = [
  "",
  "消息协议：",
  "  frontmatter metadata 字段语义与 `downcity chat send` 参数一致。",
  "  附件使用 `<file type=\"...\">path</file>`，支持 `document/photo/voice/audio/video`。",
  "  正文与 `<file>` 可以交错出现，运行时会按原顺序发送。",
  "",
  "常用示例：",
  "  downcity chat send --text 'done'",
  "  downcity chat send --chat-key <chatKey> --text 'done'",
  "  cat <<'EOF' | downcity chat send --stdin --chat-key <chatKey>",
  "  第一行",
  "  第二行",
  "  EOF",
  "  downcity chat send --text-file ./result.md --chat-key <chatKey>",
  "",
  "说明：",
  "  当前会话可省略 `--chat-key`；跨 chat 发送时必须显式传 `--chat-key`。",
  "  `--delay` 与 `--time` 互斥；ISO 时间必须带时区。",
].join("\n");

const CHAT_REACT_HELP_TEXT = [
  "",
  "常用示例：",
  "  downcity chat react --emoji '👍'",
  "  downcity chat react --emoji '✅' --message-id <messageId>",
  "  downcity chat react --chat-key <chatKey> --message-id <messageId> --emoji '🔥'",
  "",
  "说明：",
  "  当前会话可省略 `--chat-key`；跨 chat 操作时显式传 `--chat-key`。",
  "  `react` 需要目标消息，优先使用显式 `--message-id`。",
].join("\n");

function attachCommandHelpText(command: Command, text: string): void {
  command.on("--help", () => {
    console.log(text);
  });
}

/**
 * 创建 chat plugin runtime 的 action 定义表。
 */
export function createChatPluginActions(params: {
  channelState: ChatChannelState;
}): PluginActions {
  return {
    status: createAction({
      description: "View chat channel connection status.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "View chat channel connection status.",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatStatusAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatStatusActionPayload,
        });
      },
    }),
    test: createAction({
      description: "Test chat channel connectivity.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Test chat channel connectivity.",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatTestAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatTestActionPayload,
        });
      },
    }),
    reconnect: createAction({
      description: "Reconnect chat channels, all by default.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Reconnect chat channels, all by default.",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatReconnectAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatReconnectActionPayload,
        });
      },
    }),
    open: createAction({
      description: "Open and enable the specified chat channel.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Open chat channel (enabled=true, and start it if configured).",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatOpenAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatOpenActionPayload,
        });
      },
    }),
    close: createAction({
      description: "Close and disable the specified chat channel.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Close chat channel (enabled=false and stop runtime).",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatCloseAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatCloseActionPayload,
        });
      },
    }),
    configuration: createAction({
      description: "View chat channel configuration metadata.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "View chat channel configuration metadata (fields, types, descriptions).",
        configure(command: Command) {
          command.option("--channel <name>", "Specify channel (telegram|feishu|qq).");
        },
        mapInput: mapChatChannelCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatConfigurationAction({
          context: actionParams.context,
          payload: actionParams.input as ChatConfigurationActionPayload,
        });
      },
    }),
    configure: createAction({
      description: "Update runtime parameters for a chat channel.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Update runtime parameters for a chat channel, optionally restarting it immediately.",
        configure(command: Command) {
          command
            .requiredOption("--channel <name>", "Specify channel (telegram|feishu|qq).")
            .requiredOption(
              "--config-json <json>",
              "Configuration patch JSON, for example '{\"channelAccountId\":\"qq-main\",\"enabled\":true}'.",
            )
            .option("--restart", "Restart the channel immediately after configuration.", false);
        },
        mapInput: mapChatConfigureCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatConfigureAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.input as ChatConfigureActionPayload,
        });
      },
    }),
    list: createAction({
      description: "List chat conversations recorded by the current agent.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "List chat conversations recorded by the current agent (chatTitle/chatKey).",
        configure(command: Command) {
          command
            .option("--channel <name>", "Filter by channel (telegram|feishu|qq).")
            .option("--limit <n>", "Return the latest N records, default 50.")
            .option("--q <text>", "Keyword filter (title/chatId/sessionId/actor).");
        },
        mapInput: mapChatListCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatListAction({
          context: actionParams.context,
          payload: actionParams.input as ChatListActionPayload,
        });
      },
    }),
    info: createAction({
      description: "View route, paths, and context snapshot for a specified chat conversation.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "View specified chat conversation info (route/local paths/context snapshot).",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "Target chatKey; reads DC_CTX_CHAT_KEY if omitted.")
            .option("--session-id <sessionId>", "Explicit sessionId, with higher priority.");
        },
        mapInput: mapChatInfoCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatInfoAction({
          context: actionParams.context,
          payload: actionParams.input as ChatInfoActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
    send: createAction({
      description: "Send a message to the target chatKey, supporting text, attachments, and delay.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Send a message to the target chatKey.",
        configure(command: Command) {
          command
            .option("--text <text>", "Message body.")
            .option("--stdin", "Read message body from stdin.", false)
            .option("--text-file <file>", "Read message body from a file relative to the current directory.")
            .option("--reply", "Explicitly reply to the target message with reply_to_message.", false)
            .option("--message-id <id>", "Explicit reply target message ID.")
            .option(
              "--chat-key <chatKey>",
              "Target chatKey; reads DC_CTX_CHAT_KEY if omitted.",
            );
          attachCommandHelpText(command, CHAT_SEND_HELP_TEXT);
        },
        mapInput: mapChatSendCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatSendAction({
          context: actionParams.context,
          payload: actionParams.input as ChatSendActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
    react: createAction({
      description: "React to a target message, currently supported only by Telegram.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "React to a target message, currently supported only by Telegram.",
        configure(command: Command) {
          command
            .option("--emoji <emoji>", "Emoji character, default thumbs-up.")
            .option("--big", "Use large reaction effect (Telegram is_big).", false)
            .option("--message-id <id>", "Target message ID; defaults to chat meta when available.")
            .option(
              "--chat-key <chatKey>",
              "Target chatKey; reads DC_CTX_CHAT_KEY if omitted.",
            );
          attachCommandHelpText(command, CHAT_REACT_HELP_TEXT);
        },
        mapInput: mapChatReactCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatReactAction({
          context: actionParams.context,
          payload: actionParams.input as ChatReactActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
    context: createAction({
      description: "View current conversation context snapshot.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "View current conversation context snapshot.",
        configure(command: Command) {
          command.option("--chat-key <chatKey>", "Explicitly override chatKey.");
        },
        mapInput(input) {
          const chatKey =
            typeof input.opts.chatKey === "string" ? String(input.opts.chatKey).trim() : "";
          return {
            ...(chatKey ? { chatKey } : {}),
          };
        },
      },
      execute: async (actionParams) => {
        return executeChatContextAction({
          context: actionParams.context,
          payload: actionParams.input as ChatSessionActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
    delete: createAction({
      description: "Permanently delete a specified chat conversation, including mapping, history, and context.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Permanently delete a specified chat conversation, including mapping, history, and context.",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "Explicit chatKey.")
            .option("--session-id <sessionId>", "Explicit sessionId.");
        },
        mapInput: mapChatDeleteCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatDeleteAction({
          context: actionParams.context,
          payload: actionParams.input as ChatDeleteActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
    history: createAction({
      description: "Read chat history messages.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {}, additionalProperties: true },
      },
      command: {
        description: "Read chat history messages, defaulting to the latest 30.",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "Explicitly override chatKey.")
            .option("--session-id <sessionId>", "Explicitly override sessionId.")
            .option("--limit <n>", "Return the latest N records, default 30.")
            .option(
              "--direction <direction>",
              "Direction filter (all|inbound|outbound).",
            )
            .option("--before-ts <ts>", "Return only records with ts lower than this value, in milliseconds.")
            .option("--after-ts <ts>", "Return only records with ts greater than this value, in milliseconds.");
        },
        mapInput: mapChatHistoryCommandInput,
      },
      execute: async (actionParams) => {
        return executeChatHistoryAction({
          context: actionParams.context,
          payload: actionParams.input as ChatHistoryActionPayload,
          run_context: actionParams.run_context,
        });
      },
    }),
  };
}
