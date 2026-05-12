/**
 * ChatServiceActions：chat service 的 action 注册表模块。
 *
 * 关键点（中文）
 * - 这里专门负责把 chat 的 CLI/API/execute 定义装配成 `ServiceActions`。
 * - ChatService 本体只保留实例状态与 lifecycle，不再承载大段 action 声明。
 * - action 执行仍然复用各 runtime 模块，确保行为与现有实现保持一致。
 */

import type { Command } from "commander";
import type { ServiceActions } from "@/shared/types/Service.js";
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
} from "@/shared/types/ChatService.js";
import type { JsonValue } from "@/shared/types/Json.js";
import type { ChatChannelState } from "@/shared/types/ChatRuntime.js";
import {
  mapChatChannelApiInput,
  mapChatChannelApiQueryInput,
  mapChatChannelCommandInput,
  mapChatConfigureApiInput,
  mapChatConfigureCommandInput,
  mapChatDeleteApiInput,
  mapChatDeleteCommandInput,
  mapChatHistoryApiInput,
  mapChatHistoryCommandInput,
  mapChatInfoApiInput,
  mapChatInfoCommandInput,
  mapChatListApiInput,
  mapChatListCommandInput,
  mapChatReactApiInput,
  mapChatReactCommandInput,
  mapChatSendApiInput,
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
  "  frontmatter metadata 字段语义与 `city chat send` 参数一致。",
  "  附件使用 `<file type=\"...\">path</file>`，支持 `document/photo/voice/audio/video`。",
  "  正文与 `<file>` 可以交错出现，运行时会按原顺序发送。",
  "",
  "常用示例：",
  "  city chat send --text 'done'",
  "  city chat send --chat-key <chatKey> --text 'done'",
  "  cat <<'EOF' | city chat send --stdin --chat-key <chatKey>",
  "  第一行",
  "  第二行",
  "  EOF",
  "  city chat send --text-file ./result.md --chat-key <chatKey>",
  "",
  "说明：",
  "  当前会话可省略 `--chat-key`；跨 chat 发送时必须显式传 `--chat-key`。",
  "  `--delay` 与 `--time` 互斥；ISO 时间必须带时区。",
].join("\n");

const CHAT_REACT_HELP_TEXT = [
  "",
  "常用示例：",
  "  city chat react --emoji '👍'",
  "  city chat react --emoji '✅' --message-id <messageId>",
  "  city chat react --chat-key <chatKey> --message-id <messageId> --emoji '🔥'",
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
 * 创建 chat service 的 action 定义表。
 */
export function createChatServiceActions(params: {
  channelState: ChatChannelState;
}): ServiceActions {
  return {
    status: {
      command: {
        description: "查看 chat 渠道连接状态",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatChannelApiQueryInput({
            channel: c.req.query("channel"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeChatStatusAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatStatusActionPayload,
        });
      },
    },
    test: {
      command: {
        description: "测试 chat 渠道连通性",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      execute: async (actionParams) => {
        return executeChatTestAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatTestActionPayload,
        });
      },
    },
    reconnect: {
      command: {
        description: "重连 chat 渠道（默认全部）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      execute: async (actionParams) => {
        return executeChatReconnectAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatReconnectActionPayload,
        });
      },
    },
    open: {
      command: {
        description: "打开 chat 渠道（enabled=true，已配置则尝试启动）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      execute: async (actionParams) => {
        return executeChatOpenAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatOpenActionPayload,
        });
      },
    },
    close: {
      command: {
        description: "关闭 chat 渠道（enabled=false，并停止运行）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      execute: async (actionParams) => {
        return executeChatCloseAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatCloseActionPayload,
        });
      },
    },
    configuration: {
      command: {
        description: "查看 chat 渠道配置元信息（字段、类型、说明）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatChannelApiQueryInput({
            channel: c.req.query("channel"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeChatConfigurationAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatConfigurationActionPayload,
        });
      },
    },
    configure: {
      command: {
        description: "更新 chat 渠道参数（写入 downcity.json，可选立即重载）",
        configure(command: Command) {
          command
            .requiredOption("--channel <name>", "指定渠道（telegram|feishu|qq）")
            .requiredOption(
              "--config-json <json>",
              "配置 patch JSON（例如 '{\"channelAccountId\":\"qq-main\",\"enabled\":true}'）",
            )
            .option("--restart", "配置后立即重载渠道", false);
        },
        mapInput: mapChatConfigureCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatConfigureApiInput(c);
        },
      },
      execute: async (actionParams) => {
        return executeChatConfigureAction({
          state: params.channelState,
          context: actionParams.context,
          payload: actionParams.payload as ChatConfigureActionPayload,
        });
      },
    },
    list: {
      command: {
        description: "列出当前 agent 已记录的 chat 会话（chatTitle/chatKey）",
        configure(command: Command) {
          command
            .option("--channel <name>", "渠道过滤（telegram|feishu|qq）")
            .option("--limit <n>", "返回最近 N 条（默认 50）")
            .option("--q <text>", "关键词过滤（title/chatId/sessionId/actor）");
        },
        mapInput: mapChatListCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatListApiInput({
            channel: c.req.query("channel"),
            limit: c.req.query("limit"),
            q: c.req.query("q"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeChatListAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatListActionPayload,
        });
      },
    },
    info: {
      command: {
        description: "查看指定 chat 会话信息（路由/本地路径/上下文快照）",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "目标 chatKey（不传则尝试读取 DC_CTX_CHAT_KEY）")
            .option("--session-id <sessionId>", "显式指定 sessionId（优先级更高）");
        },
        mapInput: mapChatInfoCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatInfoApiInput({
            chatKey: c.req.query("chatKey"),
            sessionId: c.req.query("sessionId"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeChatInfoAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatInfoActionPayload,
        });
      },
    },
    send: {
      command: {
        description: "发送消息到目标 chatKey",
        configure(command: Command) {
          command
            .option("--text <text>", "消息正文")
            .option("--stdin", "从标准输入读取消息正文", false)
            .option("--text-file <file>", "从文件读取消息正文（相对当前目录）")
            .option("--reply", "显式使用 reply_to_message 回复目标消息", false)
            .option("--message-id <id>", "显式指定 reply 目标消息 ID")
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 DC_CTX_CHAT_KEY）",
            );
          attachCommandHelpText(command, CHAT_SEND_HELP_TEXT);
        },
        mapInput: mapChatSendCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatSendApiInput(await c.req.json());
        },
      },
      execute: async (actionParams) => {
        return executeChatSendAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatSendActionPayload,
        });
      },
    },
    react: {
      command: {
        description: "给目标消息贴表情（当前仅 Telegram 支持）",
        configure(command: Command) {
          command
            .option("--emoji <emoji>", "表情字符（默认 👍）")
            .option("--big", "使用大表情效果（Telegram is_big）", false)
            .option("--message-id <id>", "目标消息 ID（默认尝试从 chat meta 回填）")
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 DC_CTX_CHAT_KEY）",
            );
          attachCommandHelpText(command, CHAT_REACT_HELP_TEXT);
        },
        mapInput: mapChatReactCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatReactApiInput(await c.req.json());
        },
      },
      execute: async (actionParams) => {
        return executeChatReactAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatReactActionPayload,
        });
      },
    },
    context: {
      command: {
        description: "查看当前会话上下文快照",
        configure(command: Command) {
          command.option("--chat-key <chatKey>", "显式覆盖 chatKey");
        },
        mapInput(input) {
          const chatKey =
            typeof input.opts.chatKey === "string" ? String(input.opts.chatKey).trim() : "";
          return {
            ...(chatKey ? { chatKey } : {}),
          };
        },
      },
      api: {
        method: "GET",
        mapInput(c) {
          const chatKey = String(c.req.query("chatKey") || "").trim();
          const sessionId = String(c.req.query("sessionId") || "").trim();
          return {
            ...(chatKey ? { chatKey } : {}),
            ...(sessionId ? { sessionId } : {}),
          };
        },
      },
      execute: async (actionParams) => {
        return executeChatContextAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatSessionActionPayload,
        });
      },
    },
    delete: {
      command: {
        description: "彻底删除指定 chat 会话（映射+历史+context）",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "显式指定 chatKey")
            .option("--session-id <sessionId>", "显式指定 sessionId");
        },
        mapInput: mapChatDeleteCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatDeleteApiInput(await c.req.json().catch(() => ({} as JsonValue)));
        },
      },
      execute: async (actionParams) => {
        return executeChatDeleteAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatDeleteActionPayload,
        });
      },
    },
    history: {
      command: {
        description: "读取 chat 历史消息（默认最近 30 条）",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "显式覆盖 chatKey")
            .option("--session-id <sessionId>", "显式覆盖 sessionId")
            .option("--limit <n>", "返回最近 N 条（默认 30）")
            .option(
              "--direction <direction>",
              "方向过滤（all|inbound|outbound）",
            )
            .option("--before-ts <ts>", "仅返回 ts 小于该值的记录（毫秒）")
            .option("--after-ts <ts>", "仅返回 ts 大于该值的记录（毫秒）");
        },
        mapInput: mapChatHistoryCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatHistoryApiInput({
            chatKey: c.req.query("chatKey"),
            sessionId: c.req.query("sessionId"),
            limit: c.req.query("limit"),
            direction: c.req.query("direction"),
            beforeTs: c.req.query("beforeTs"),
            afterTs: c.req.query("afterTs"),
          });
        },
      },
      execute: async (actionParams) => {
        return executeChatHistoryAction({
          context: actionParams.context,
          payload: actionParams.payload as ChatHistoryActionPayload,
        });
      },
    },
  };
}
